import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const require = createRequire(import.meta.url);

function loadServer() {
  assert.ok(fs.existsSync(SERVER_PATH), "server.js must exist");
  return require(SERVER_PATH);
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("upload endpoint rejects requests when PINATA_JWT is missing", async () => {
  const { createUploadMetadataHandler } = loadServer();
  const handler = createUploadMetadataHandler({
    env: {},
    logger: { error() {} },
    pinataFetch: async () => {
      throw new Error("Pinata must not be called");
    },
  });
  const response = createResponse();

  await handler({ body: { name: "DPP" } }, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    error: "PINATA_JWT is not configured on the server.",
  });
});

test("upload endpoint maps a mocked Pinata response to an IPFS token URI", async () => {
  const { createUploadMetadataHandler, PINATA_ENDPOINT } = loadServer();
  let upstreamRequest = null;
  const metadata = {
    name: "Evergreen DPP #A2207",
    dpp: { order: "#A2207", stage: "dye-fnsh" },
  };
  const handler = createUploadMetadataHandler({
    env: {
      PINATA_JWT: "server-side-test-jwt",
      PINATA_GATEWAY: "https://demo.mypinata.cloud/ipfs",
    },
    now: () => 1234567890,
    logger: { error() {} },
    pinataFetch: async (url, options) => {
      upstreamRequest = { url, options };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ IpfsHash: "bafy-real-cid" });
        },
      };
    },
  });
  const response = createResponse();

  await handler({ body: metadata }, response);

  assert.equal(upstreamRequest.url, PINATA_ENDPOINT);
  assert.equal(
    upstreamRequest.options.headers.Authorization,
    "Bearer server-side-test-jwt",
  );
  assert.equal(
    upstreamRequest.options.headers["Content-Type"],
    "application/json",
  );
  assert.deepEqual(JSON.parse(upstreamRequest.options.body), {
    pinataOptions: { cidVersion: 1 },
    pinataMetadata: {
      name: "dpp-A2207-dye-fnsh-1234567890.json",
    },
    pinataContent: metadata,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    cid: "bafy-real-cid",
    tokenURI: "ipfs://bafy-real-cid",
    gatewayURL: "https://demo.mypinata.cloud/ipfs/bafy-real-cid",
  });
});

test("IPFS token URI normalization preserves CID paths", () => {
  const { normalizeIPFSTokenURI } = loadServer();

  assert.deepEqual(
    normalizeIPFSTokenURI("ipfs://bafy-test/path/to/file.json"),
    {
      cid: "bafy-test",
      path: "path/to/file.json",
      tokenURI: "ipfs://bafy-test/path/to/file.json",
    },
  );
  assert.deepEqual(
    normalizeIPFSTokenURI(
      "https://untrusted.example/ipfs/bafy-test/path/to/file.json",
    ),
    {
      cid: "bafy-test",
      path: "path/to/file.json",
      tokenURI: "ipfs://bafy-test/path/to/file.json",
    },
  );
});

test("IPFS token URI normalization rejects non-IPFS and unsafe URLs", () => {
  const { normalizeIPFSTokenURI } = loadServer();

  assert.throws(() => normalizeIPFSTokenURI(""), /tokenURI is required/);
  assert.throws(
    () => normalizeIPFSTokenURI("https://example.com/private"),
    /\/ipfs\/ path/,
  );
  assert.throws(
    () => normalizeIPFSTokenURI("http://127.0.0.1:9999/ipfs/bafy-test"),
    /Unsupported IPFS token URI/,
  );
  assert.throws(
    () => normalizeIPFSTokenURI("ipfs://bafy-test/../secret"),
    /path/,
  );
  assert.throws(
    () => normalizeIPFSTokenURI("ipfs://bafy-test/%E0%A4%A"),
    /path/,
  );
  assert.throws(
    () =>
      normalizeIPFSTokenURI(
        "https://user:password@example.com/ipfs/bafy-test",
      ),
    /Unsupported IPFS token URI/,
  );
});

test("metadata reader does not require PINATA_JWT and preserves CID paths", async () => {
  const { createFetchMetadataHandler } = loadServer();
  let upstreamRequest = null;
  const handler = createFetchMetadataHandler({
    env: { PINATA_GATEWAY: "https://trusted.example/ipfs" },
    gatewayFetch: async (url, options) => {
      upstreamRequest = { url, options };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ name: "Fetched DPP" });
        },
      };
    },
    now: () => new Date("2026-06-22T00:00:00.000Z"),
    logger: { error() {} },
  });
  const response = createResponse();

  await handler(
    { query: { tokenURI: "ipfs://bafy-test/path/to/file.json" } },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(
    upstreamRequest.url,
    "https://trusted.example/ipfs/bafy-test/path/to/file.json",
  );
  assert.equal(upstreamRequest.options.headers.Accept, "application/json");
  assert.ok(upstreamRequest.options.signal);
  assert.deepEqual(response.body, {
    metadata: { name: "Fetched DPP" },
    source: "ipfs",
    tokenURI: "ipfs://bafy-test/path/to/file.json",
    gatewayURL: "https://trusted.example/ipfs/bafy-test/path/to/file.json",
    fetchedAt: "2026-06-22T00:00:00.000Z",
  });
});

test("metadata reader rebuilds HTTPS gateway inputs on the configured gateway", async () => {
  const { createFetchMetadataHandler } = loadServer();
  let upstreamURL = null;
  const handler = createFetchMetadataHandler({
    env: { PINATA_GATEWAY: "trusted.example" },
    gatewayFetch: async (url) => {
      upstreamURL = url;
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ name: "Gateway DPP" });
        },
      };
    },
    logger: { error() {} },
  });
  const response = createResponse();

  await handler(
    {
      query: {
        tokenURI:
          "https://attacker.example/ipfs/bafy-test/metadata.json",
      },
    },
    response,
  );

  assert.equal(
    upstreamURL,
    "https://trusted.example/ipfs/bafy-test/metadata.json",
  );
  assert.equal(
    response.body.tokenURI,
    "ipfs://bafy-test/metadata.json",
  );
});

test("metadata reader returns 400 when tokenURI is missing", async () => {
  const { createFetchMetadataHandler } = loadServer();
  const handler = createFetchMetadataHandler({
    env: {},
    gatewayFetch: async () => {
      throw new Error("Gateway must not be called");
    },
    logger: { error() {} },
  });
  const response = createResponse();

  await handler({ query: {} }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "tokenURI is required." });
});

test("metadata reader returns safe gateway and JSON errors", async () => {
  const { createFetchMetadataHandler } = loadServer();

  for (const gatewayResponse of [
    {
      ok: false,
      status: 504,
      async text() {
        return "upstream secret error";
      },
    },
    {
      ok: true,
      status: 200,
      async text() {
        return "not-json";
      },
    },
  ]) {
    const handler = createFetchMetadataHandler({
      env: {},
      gatewayFetch: async () => gatewayResponse,
      logger: { error() {} },
    });
    const response = createResponse();

    await handler(
      { query: { tokenURI: "ipfs://bafy-test" } },
      response,
    );

    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.body, {
      error: "Unable to fetch metadata from the IPFS gateway.",
    });
    assert.doesNotMatch(JSON.stringify(response.body), /upstream secret/);
  }
});

test("metadata reader aborts gateway requests after the configured timeout", async () => {
  const { createFetchMetadataHandler } = loadServer();
  const handler = createFetchMetadataHandler({
    env: {},
    timeoutMs: 5,
    gatewayFetch: async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    logger: { error() {} },
  });
  const response = createResponse();

  await handler(
    { query: { tokenURI: "ipfs://bafy-test" } },
    response,
  );

  assert.equal(response.statusCode, 504);
  assert.deepEqual(response.body, {
    error: "IPFS gateway request timed out.",
  });
});

test("Express app registers the metadata read endpoint", () => {
  const source = fs.readFileSync(SERVER_PATH, "utf8");
  assert.match(
    source,
    /app\.get\(\s*["']\/fetch-metadata["']\s*,\s*createFetchMetadataHandler/,
  );
});

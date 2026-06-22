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

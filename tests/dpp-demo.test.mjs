import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML_PATH = path.join(ROOT, "factory-endpoint.html");
const CONTRACT_PATH = path.join(ROOT, "contracts", "SimpleDPPNFT.sol");
const DEPLOYED_SEPOLIA_ADDRESS =
  "0x24aeeb254a48820b5b0bdcbdce980a725535718f";

const html = fs.readFileSync(HTML_PATH, "utf8");
const contract = fs.existsSync(CONTRACT_PATH)
  ? fs.readFileSync(CONTRACT_PATH, "utf8")
  : "";

function metadataHelpersSource() {
  const startMarker = "/* ---------- DPP metadata helpers ---------- */";
  const endMarker = "/* ---------- Views ---------- */";
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker);

  assert.notEqual(start, -1, `Missing ${startMarker}`);
  assert.notEqual(end, -1, `Missing ${endMarker}`);
  assert.ok(end > start, "Metadata helper block must precede the views");
  return html.slice(start + startMarker.length, end);
}

function loadMetadataHelpers(
  fields,
  {
    useMockIpfs = false,
    fetchImpl = async () => {
      throw new Error("Backend unavailable");
    },
  } = {},
) {
  const localStorageEntries = new Map();
  const context = vm.createContext({
    FIELDS: structuredClone(fields),
    CONTRACT_ADDRESS: DEPLOYED_SEPOLIA_ADDRESS,
    USE_MOCK_IPFS: useMockIpfs,
    IPFS_UPLOAD_ENDPOINT: "http://localhost:3001/upload-metadata",
    IPFS_METADATA_FETCH_ENDPOINT: "http://localhost:3001/fetch-metadata",
    DPP_SCHEMA: "dpp-dye-fnsh-v1",
    DPP_ORDER: "#A2207",
    DPP_STAGE: "dye-fnsh",
    DPP_PREVIOUS_TOKEN_ID: 1041,
    FACTORY_DID: "did:web:evergreen-dye.example",
    Date,
    localStorage: {
      setItem(key, value) {
        localStorageEntries.set(key, String(value));
      },
      getItem(key) {
        return localStorageEntries.get(key) ?? null;
      },
      removeItem(key) {
        localStorageEntries.delete(key);
      },
    },
    fetch: fetchImpl,
    console: { log() {}, warn() {} },
    ethers: {
      toUtf8Bytes(value) {
        return `utf8:${value}`;
      },
      keccak256(value) {
        return `keccak256(${value})`;
      },
    },
  });

  vm.runInContext(
    `${metadataHelpersSource()}
this.stableStringify = stableStringify;
this.buildMetadataJson = buildMetadataJson;
this.computeDPPHashes = computeDPPHashes;
this.uploadMetadataToIPFS = uploadMetadataToIPFS;
this.fetchMetadataFromIPFS = typeof fetchMetadataFromIPFS === 'function' ? fetchMetadataFromIPFS : undefined;
this.verifyMetadataHash = typeof verifyMetadataHash === 'function' ? verifyMetadataHash : undefined;
this.metadataCacheKey = typeof metadataCacheKey === 'function' ? metadataCacheKey : undefined;
this.saveMintedMetadataCache = typeof saveMintedMetadataCache === 'function' ? saveMintedMetadataCache : undefined;
this.loadMintedMetadataCache = typeof loadMintedMetadataCache === 'function' ? loadMintedMetadataCache : undefined;`,
    context,
  );
  context.localStorageEntries = localStorageEntries;
  return context;
}

function inlineApplicationSource() {
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  assert.equal(inlineScripts.length, 1, "Expected one inline application script");
  return inlineScripts[0];
}

function createApplicationContext() {
  const elements = new Map();
  const alerts = [];
  const localStorageEntries = new Map();
  const makeElement = () => ({
    innerHTML: "",
    textContent: "",
    className: "",
    title: "",
    style: {},
    disabled: false,
    classList: {
      add() {},
      remove() {},
    },
    addEventListener() {},
    appendChild() {},
    remove() {},
  });
  const document = {
    body: makeElement(),
    createElement: makeElement,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
  };
  const context = vm.createContext({
    document,
    localStorage: {
      setItem(key, value) {
        localStorageEntries.set(key, String(value));
      },
      getItem(key) {
        return localStorageEntries.get(key) ?? null;
      },
      removeItem(key) {
        localStorageEntries.delete(key);
      },
    },
    console: { log() {}, error() {}, warn() {} },
    alert(message) {
      alerts.push(message);
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    encodeURIComponent,
    Date,
    BigInt,
  });
  context.window = context;
  context.window.scrollTo = () => {};
  return { context, elements, alerts, localStorageEntries };
}

function installControlledMintScenario(
  context,
  { readMode = "match", emitTokenId = true } = {},
) {
  const account = "0x1234567890123456789012345678901234567890";
  let uploadedMetadata = null;
  let metadataFetchCount = 0;
  let mintCallCount = 0;
  let resolveMetadataFetch = null;

  context.fetch = async (url, options) => {
    if (url === "http://localhost:3001/upload-metadata") {
      uploadedMetadata = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            cid: "bafy-real-cid",
            tokenURI: "ipfs://bafy-real-cid",
            gatewayURL: "https://gateway.example/ipfs/bafy-real-cid",
          };
        },
      };
    }
    if (
      url.startsWith(
        "http://localhost:3001/fetch-metadata?tokenURI=",
      )
    ) {
      metadataFetchCount += 1;
      if (readMode === "failure") {
        throw new Error("gateway unavailable");
      }
      const metadata =
        readMode === "mismatch"
          ? { ...uploadedMetadata, name: "Tampered DPP" }
          : uploadedMetadata;
      const readResponse = {
        ok: true,
        status: 200,
        async json() {
          return {
            metadata,
            source: "ipfs",
            tokenURI: "ipfs://bafy-real-cid",
            gatewayURL: "https://gateway.example/ipfs/bafy-real-cid",
            fetchedAt: "2026-06-22T00:00:00.000Z",
          };
        },
      };
      if (readMode === "deferred") {
        return new Promise((resolve) => {
          resolveMetadataFetch = () => resolve(readResponse);
        });
      }
      return readResponse;
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
  context.ethereum = {
    on() {},
    async request({ method }) {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return [account];
      }
      if (method === "eth_chainId") return "0xaa36a7";
      throw new Error(`Unexpected wallet method: ${method}`);
    },
  };
  context.ethers = {
    ZeroAddress: "0x0000000000000000000000000000000000000000",
    isAddress() {
      return true;
    },
    toUtf8Bytes(value) {
      return `utf8:${value}`;
    },
    keccak256(value) {
      return `hash:${value}`;
    },
    BrowserProvider: class {
      async getNetwork() {
        return { chainId: 11155111n };
      }
      async getSigner() {
        return {
          async getAddress() {
            return account;
          },
        };
      }
    },
    Contract: class {
      interface = {
        parseLog(log) {
          if (log.kind !== "DPPMinted") throw new Error("Different event");
          return { name: "DPPMinted", args: { tokenId: 77n } };
        },
      };
      async mintDPP() {
        mintCallCount += 1;
        return {
          hash: "0xfeed1234",
          async wait() {
            return {
              logs: emitTokenId
                ? [{ kind: "DPPMinted" }]
                : [{ kind: "Transfer" }],
            };
          },
        };
      }
    },
  };

  return {
    get metadataFetchCount() {
      return metadataFetchCount;
    },
    get mintCallCount() {
      return mintCallCount;
    },
    resolveMetadataFetch() {
      assert.equal(typeof resolveMetadataFetch, "function");
      resolveMetadataFetch();
    },
  };
}

test("Solidity contract stores and emits every requested DPP field", () => {
  assert.match(contract, /contract\s+SimpleDPPNFT\s+is\s+ERC721URIStorage/);
  assert.match(contract, /struct\s+DPPRecord\s*{[\s\S]*bytes32\s+metadataHash;/);
  assert.match(contract, /bytes32\s+schemaHash;/);
  assert.match(contract, /bytes32\s+orderHash;/);
  assert.match(contract, /bytes32\s+stage;/);
  assert.match(contract, /uint256\s+previousTokenId;/);
  assert.match(contract, /address\s+issuer;/);
  assert.match(contract, /uint256\s+createdAt;/);
  assert.match(
    contract,
    /function\s+mintDPP\s*\(\s*address\s+to,\s*string\s+calldata\s+tokenURI_,\s*bytes32\s+metadataHash,\s*bytes32\s+schemaHash,\s*bytes32\s+orderHash,\s*bytes32\s+stage,\s*uint256\s+previousTokenId\s*\)\s*external\s*returns\s*\(uint256\s+tokenId\)/,
  );
  assert.match(contract, /event\s+DPPMinted\s*\(/);
  assert.match(contract, /emit\s+DPPMinted\s*\(/);
});

test("HTML exposes the ethers v6 Sepolia wallet and contract configuration", () => {
  assert.match(
    html,
    /https:\/\/cdn\.jsdelivr\.net\/npm\/ethers@6\.17\.0\/dist\/ethers\.umd\.min\.js/,
  );
  assert.match(html, /const\s+CONTRACT_ADDRESS\s*=/);
  assert.match(html, /const\s+CONTRACT_ABI\s*=/);
  assert.match(html, /const\s+SEPOLIA_CHAIN_ID\s*=\s*11155111/);
  assert.match(html, /const\s+SEPOLIA_CHAIN_HEX\s*=\s*['"]0xaa36a7['"]/);
  assert.match(html, /async\s+function\s+connectWallet\s*\(/);
  assert.match(html, /async\s+function\s+switchToSepolia\s*\(/);
  assert.match(html, /accountsChanged/);
  assert.match(html, /chainChanged/);
});

test("frontend defaults to the local real-IPFS upload backend", () => {
  assert.match(html, /const\s+USE_MOCK_IPFS\s*=\s*false/);
  assert.match(
    html,
    /const\s+IPFS_UPLOAD_ENDPOINT\s*=\s*['"]http:\/\/localhost:3001\/upload-metadata['"]/,
  );
  assert.match(html, /if\s*\(\s*USE_MOCK_IPFS\s*===\s*true\s*\)/);
  assert.match(
    html,
    /const\s+IPFS_METADATA_FETCH_ENDPOINT\s*=\s*['"]http:\/\/localhost:3001\/fetch-metadata['"]/,
  );
});

test("frontend targets the deployed SimpleDPPNFT contract on Sepolia", () => {
  assert.match(
    html,
    new RegExp(
      `const\\s+CONTRACT_ADDRESS\\s*=\\s*['"]${DEPLOYED_SEPOLIA_ADDRESS}['"]`,
    ),
  );
  assert.match(
    html,
    /function mintDPP\(address to,string tokenURI_,bytes32 metadataHash,bytes32 schemaHash,bytes32 orderHash,bytes32 stage,uint256 previousTokenId\)/,
  );
  assert.match(
    html,
    /event DPPMinted\(uint256 indexed tokenId,address indexed recipient,string tokenURI,bytes32 metadataHash,bytes32 schemaHash,bytes32 orderHash,bytes32 stage,uint256 previousTokenId\)/,
  );
});

test("Home health status is derived from live wallet state, not a stale ready label", () => {
  assert.doesNotMatch(html, /TEE 已連線 · 👛 錢包就緒/);
  assert.match(
    html,
    /walletState\.account\?'錢包已連線':'錢包尚未連線'/,
  );
});

test("stableStringify recursively sorts object keys and preserves array order", () => {
  const helpers = loadMetadataHelpers([]);
  const value = {
    z: 1,
    a: { d: 4, b: 2 },
    arr: [{ y: 2, x: 1 }, 3],
  };

  assert.equal(
    helpers.stableStringify(value),
    '{"a":{"b":2,"d":4},"arr":[{"x":1,"y":2},3],"z":1}',
  );
});

test("buildMetadataJson partitions live FIELDS state without publicizing private attributes", () => {
  const helpers = loadMetadataHelpers([
    {
      id: "public",
      key: "batch",
      label: "Batch",
      val: "B-1",
      disclosure: "public",
    },
    {
      id: "private",
      key: "recipe",
      label: "Recipe",
      val: "secret-blue",
      disclosure: "private",
    },
  ]);

  const metadata = helpers.buildMetadataJson();
  const normalized = structuredClone(metadata);

  assert.equal(normalized.name, "Evergreen DPP #A2207 · dye-fnsh");
  assert.equal(normalized.dpp.publicData.batch, "B-1");
  assert.match(normalized.dpp.encryptedData.recipe, /^ENC\(DEMO_ONLY:/);
  assert.equal(normalized.dpp.encryptionNotice, "DEMO_ONLY_NOT_REAL_ENCRYPTION");
  assert.equal(normalized.dpp.previousTokenId, 1041);
  assert.equal(
    normalized.attributes.find((attribute) => attribute.trait_type === "Recipe")
      .value,
    "Encrypted (demo placeholder)",
  );
  assert.doesNotMatch(
    JSON.stringify(normalized.attributes),
    /secret-blue/,
  );
});

test("real IPFS mode posts metadata to the local backend", async () => {
  let request = null;
  const helpers = loadMetadataHelpers([], {
    useMockIpfs: false,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            cid: "bafy-real-cid",
            tokenURI: "ipfs://bafy-real-cid",
            gatewayURL: "https://gateway.example/ipfs/bafy-real-cid",
          };
        },
      };
    },
  });
  const metadata = { name: "Real DPP" };
  const result = await helpers.uploadMetadataToIPFS(metadata);

  assert.equal(request.url, "http://localhost:3001/upload-metadata");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.options.body), metadata);
  assert.deepEqual(structuredClone(result), {
    cid: "bafy-real-cid",
    tokenURI: "ipfs://bafy-real-cid",
    gatewayURL: "https://gateway.example/ipfs/bafy-real-cid",
    uploadMode: "real backend",
    uploadEndpoint: "http://localhost:3001/upload-metadata",
  });
});

test("explicit mock IPFS mode returns the deterministic demo URI", async () => {
  const helpers = loadMetadataHelpers([], { useMockIpfs: true });
  const result = await helpers.uploadMetadataToIPFS({ name: "test" });

  assert.deepEqual(structuredClone(result), {
    cid: "bafy-demo-cid",
    tokenURI: "ipfs://bafy-demo-cid/metadata.json",
    gatewayURL: null,
    uploadMode: "mock",
    uploadEndpoint: null,
  });
});

test("real IPFS mode rejects backend errors without a fake URI fallback", async () => {
  const helpers = loadMetadataHelpers([], {
    useMockIpfs: false,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async json() {
        return { error: "PINATA_JWT is not configured on the server." };
      },
    }),
  });

  await assert.rejects(
    helpers.uploadMetadataToIPFS({ name: "test" }),
    /PINATA_JWT is not configured/,
  );
});

test("real IPFS mode rejects a demo CID returned by the backend", async () => {
  const helpers = loadMetadataHelpers([], {
    useMockIpfs: false,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          cid: "bafy-demo-cid",
          tokenURI: "ipfs://bafy-demo-cid/metadata.json",
          gatewayURL: null,
        };
      },
    }),
  });

  await assert.rejects(
    helpers.uploadMetadataToIPFS({ name: "test" }),
    /rejected the demo CID/,
  );
});

test("frontend fetches metadata through the local IPFS read endpoint", async () => {
  let request = null;
  const helpers = loadMetadataHelpers([], {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            metadata: { name: "Fetched DPP" },
            source: "ipfs",
            tokenURI: "ipfs://bafy-test/path/file.json",
            gatewayURL:
              "https://gateway.example/ipfs/bafy-test/path/file.json",
            fetchedAt: "2026-06-22T00:00:00.000Z",
          };
        },
      };
    },
  });

  const result = await helpers.fetchMetadataFromIPFS(
    "ipfs://bafy-test/path/file.json",
  );

  assert.equal(
    request.url,
    "http://localhost:3001/fetch-metadata?tokenURI=ipfs%3A%2F%2Fbafy-test%2Fpath%2Ffile.json",
  );
  assert.equal(request.options, undefined);
  assert.deepEqual(structuredClone(result), {
    metadata: { name: "Fetched DPP" },
    source: "ipfs",
    tokenURI: "ipfs://bafy-test/path/file.json",
    gatewayURL:
      "https://gateway.example/ipfs/bafy-test/path/file.json",
    fetchedAt: "2026-06-22T00:00:00.000Z",
  });
});

test("metadata verification reuses stableStringify and keccak256", () => {
  const helpers = loadMetadataHelpers([]);
  const metadata = { z: 2, a: { y: 3, x: 1 } };
  const expectedHash =
    'keccak256(utf8:{"a":{"x":1,"y":3},"z":2})';

  const verification = structuredClone(
    helpers.verifyMetadataHash(metadata, expectedHash.toUpperCase()),
  );

  assert.deepEqual(verification, {
    canonicalJson: '{"a":{"x":1,"y":3},"z":2}',
    computedHash: expectedHash,
    expectedHash: expectedHash.toUpperCase(),
    matches: true,
  });
});

test("computeDPPHashes hashes canonical metadata and the fixed DPP identifiers", () => {
  const helpers = loadMetadataHelpers([]);
  const hashes = helpers.computeDPPHashes({ z: 2, a: 1 });

  assert.equal(
    hashes.metadataHash,
    'keccak256(utf8:{"a":1,"z":2})',
  );
  assert.equal(hashes.schemaHash, "keccak256(utf8:dpp-dye-fnsh-v1)");
  assert.equal(hashes.orderHash, "keccak256(utf8:#A2207)");
  assert.equal(hashes.stage, "keccak256(utf8:dye-fnsh)");
});

test("metadata cache helpers save and recover the required local-only record", () => {
  const helpers = loadMetadataHelpers([]);
  assert.equal(typeof helpers.metadataCacheKey, "function");
  assert.equal(typeof helpers.saveMintedMetadataCache, "function");
  assert.equal(typeof helpers.loadMintedMetadataCache, "function");

  const chainState = {
    tx: "0xfeed1234",
    tokenURI: "ipfs://bafy-demo-cid/metadata.json",
    metadataHash: "0xmetadata",
    metadata: { name: "Cached DPP" },
    canonicalJson: '{"name":"Cached DPP"}',
  };
  const key = helpers.saveMintedMetadataCache("77", chainState);

  assert.equal(
    key,
    `dpp-demo-metadata:${DEPLOYED_SEPOLIA_ADDRESS}:77`,
  );
  const cached = structuredClone(helpers.loadMintedMetadataCache("77"));
  assert.deepEqual(
    {
      contractAddress: cached.contractAddress,
      tokenId: cached.tokenId,
      tx: cached.tx,
      tokenURI: cached.tokenURI,
      metadataHash: cached.metadataHash,
      metadata: cached.metadata,
      canonicalJson: cached.canonicalJson,
      note: cached.note,
    },
    {
      contractAddress: DEPLOYED_SEPOLIA_ADDRESS,
      tokenId: "77",
      tx: "0xfeed1234",
      tokenURI: "ipfs://bafy-demo-cid/metadata.json",
      metadataHash: "0xmetadata",
      metadata: { name: "Cached DPP" },
      canonicalJson: '{"name":"Cached DPP"}',
      note: "LOCAL_DEMO_CACHE_ONLY_NOT_ON_CHAIN",
    },
  );
  assert.match(cached.savedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("chain status UI distinguishes submitted metadata from canonical hash input and on-chain data", () => {
  assert.match(html, /本次送出的 DPP Metadata JSON/);
  assert.match(html, /Canonical JSON used for metadataHash/);
  assert.match(html, /LOCAL_DEMO_CACHE_ONLY_NOT_ON_CHAIN/);
  assert.match(html, /鏈上只保存 tokenURI、metadataHash 與 DPP record 欄位/);
  assert.doesNotMatch(html, /鏈上保存完整(?:的)? Metadata JSON/);
  assert.match(html, /IPFS tokenURI.*metadataHash.*source of truth/);
  assert.match(html, /IPFS mode:/);
  assert.match(html, /Upload endpoint:/);
  assert.match(html, /Backend status:/);
  assert.match(html, /CID:/);
  assert.match(html, /Gateway URL:/);
  assert.doesNotMatch(html, /目前 IPFS upload 仍為 mock/);
});

test("doSign sends mintDPP through an ethers BrowserProvider and parses the event", () => {
  assert.match(html, /async\s+function\s+doSign\s*\(/);
  assert.match(html, /new\s+ethers\.BrowserProvider\s*\(\s*window\.ethereum\s*\)/);
  assert.match(html, /\.getSigner\s*\(/);
  assert.match(html, /new\s+ethers\.Contract\s*\(/);
  assert.match(html, /\.mintDPP\s*\(/);
  assert.match(html, /await\s+tx\.wait\s*\(/);
  assert.match(html, /\.parseLog\s*\(/);
  assert.match(html, /DPPMinted/);
});

test("the complete inline application boots and handles injected Sepolia switching", async () => {
  const { context, elements, alerts } = createApplicationContext();
  vm.runInContext(inlineApplicationSource(), context);

  assert.match(elements.get("main").innerHTML, /首頁/);
  assert.equal(elements.get("walletButton").textContent, "👛 尚未連線");
  assert.equal(elements.get("networkStatus").textContent, "網路:未安裝錢包");

  await vm.runInContext("connectWallet()", context);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /MetaMask、OKX Wallet/);

  let chainId = "0x1";
  context.ethereum = {
    on() {},
    async request({ method, params }) {
      if (method === "eth_requestAccounts" || method === "eth_accounts") {
        return ["0x1234567890123456789012345678901234567890"];
      }
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_switchEthereumChain") {
        assert.equal(params[0].chainId, "0xaa36a7");
        chainId = "0xaa36a7";
        return null;
      }
      throw new Error(`Unexpected wallet method: ${method}`);
    },
  };

  await vm.runInContext("connectWallet()", context);
  assert.equal(elements.get("walletButton").textContent, "👛 0x1234…7890");
  assert.equal(elements.get("networkStatus").textContent, "⚠ 錯誤網路 (1)");

  const switched = await vm.runInContext("switchToSepolia()", context);
  assert.equal(switched, true);
  assert.equal(elements.get("networkStatus").textContent, "✓ Sepolia");
});

test("doSign preserves submitted metadata, caches it, and renders the confirmed result", async () => {
  const { context, elements, localStorageEntries } = createApplicationContext();
  const account = "0x1234567890123456789012345678901234567890";
  let constructedContractAddress = null;
  let mintArguments = null;
  let uploadedMetadata = null;
  context.fetch = async (url, options) => {
    if (url === "http://localhost:3001/upload-metadata") {
      assert.equal(options.method, "POST");
      uploadedMetadata = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            cid: "bafy-real-cid",
            tokenURI: "ipfs://bafy-real-cid",
            gatewayURL: "https://gateway.example/ipfs/bafy-real-cid",
          };
        },
      };
    }
    assert.match(
      url,
      /^http:\/\/localhost:3001\/fetch-metadata\?tokenURI=/,
    );
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          metadata: uploadedMetadata,
          source: "ipfs",
          tokenURI: "ipfs://bafy-real-cid",
          gatewayURL: "https://gateway.example/ipfs/bafy-real-cid",
          fetchedAt: "2026-06-22T00:00:00.000Z",
        };
      },
    };
  };
  context.ethereum = {
    on() {},
    async request({ method }) {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return [account];
      }
      if (method === "eth_chainId") return "0xaa36a7";
      throw new Error(`Unexpected wallet method: ${method}`);
    },
  };
  context.ethers = {
    ZeroAddress: "0x0000000000000000000000000000000000000000",
    isAddress() {
      return true;
    },
    toUtf8Bytes(value) {
      return `utf8:${value}`;
    },
    keccak256(value) {
      return `hash:${value}`;
    },
    BrowserProvider: class {
      async getNetwork() {
        return { chainId: 11155111n };
      }
      async getSigner() {
        return {
          async getAddress() {
            return account;
          },
        };
      }
    },
    Contract: class {
      constructor(address) {
        constructedContractAddress = address;
      }
      interface = {
        parseLog(log) {
          if (log.kind !== "DPPMinted") throw new Error("Different event");
          return { name: "DPPMinted", args: { tokenId: 77n } };
        },
      };
      async mintDPP(...args) {
        mintArguments = args;
        return {
          hash: "0xfeed1234",
          async wait() {
            return { logs: [{ kind: "Transfer" }, { kind: "DPPMinted" }] };
          },
        };
      }
    },
  };

  vm.runInContext(inlineApplicationSource(), context);
  await vm.runInContext("refreshWalletState(false)", context);
  await vm.runInContext("doSign()", context);

  const chainState = vm.runInContext(
    "JSON.parse(JSON.stringify(state.chain))",
    context,
  );
  assert.equal(constructedContractAddress, DEPLOYED_SEPOLIA_ADDRESS);
  assert.equal(mintArguments[1], "ipfs://bafy-real-cid");
  assert.equal(chainState.cid, "bafy-real-cid");
  assert.equal(chainState.gatewayURL, "https://gateway.example/ipfs/bafy-real-cid");
  assert.equal(chainState.uploadMode, "real backend");
  assert.equal(
    chainState.uploadEndpoint,
    "http://localhost:3001/upload-metadata",
  );
  assert.equal(chainState.backendStatus, "upload succeeded");
  assert.equal(chainState.passportStatus, "verified-ipfs");
  assert.equal(chainState.metadataSource, "ipfs");
  assert.equal(chainState.fetchedMetadata.name, chainState.metadata.name);
  assert.equal(chainState.metadataVerification.matches, true);
  assert.equal(
    chainState.metadataGatewayURL,
    "https://gateway.example/ipfs/bafy-real-cid",
  );
  assert.equal(chainState.metadata.name, "Evergreen DPP #A2207 · dye-fnsh");
  assert.equal(
    chainState.canonicalJson,
    vm.runInContext("stableStringify(state.chain.metadata)", context),
  );
  assert.equal(
    chainState.metadataCacheKey,
    `dpp-demo-metadata:${DEPLOYED_SEPOLIA_ADDRESS}:77`,
  );
  const cached = JSON.parse(
    localStorageEntries.get(chainState.metadataCacheKey),
  );
  assert.equal(cached.note, "LOCAL_DEMO_CACHE_ONLY_NOT_ON_CHAIN");
  assert.equal(cached.metadata.name, chainState.metadata.name);
  assert.equal(cached.canonicalJson, chainState.canonicalJson);
  assert.match(elements.get("main").innerHTML, /0xfeed1234/);
  assert.match(elements.get("main").innerHTML, /#77/);
  assert.match(elements.get("main").innerHTML, /已確認/);
  assert.match(elements.get("main").innerHTML, /本次送出的 DPP Metadata JSON/);
  assert.match(elements.get("main").innerHTML, /Canonical JSON used for metadataHash/);
  assert.match(elements.get("main").innerHTML, /IPFS mode:<b>real backend<\/b>/);
  assert.match(elements.get("main").innerHTML, /Backend status:<b>upload succeeded<\/b>/);
  assert.match(elements.get("main").innerHTML, /CID:<code>bafy-real-cid<\/code>/);
  assert.match(elements.get("main").innerHTML, /metadata was uploaded through the local Pinata proxy/i);
  assert.doesNotMatch(elements.get("main").innerHTML, /bafy-demo-cid/);
  assert.doesNotMatch(elements.get("main").innerHTML, /IPFS upload 仍為 mock/);
  const output = elements.get("main").innerHTML;
  assert.match(output, /DPP Passport/);
  assert.match(output, /Product \/ order overview/);
  assert.match(output, /Public production data/);
  assert.match(output, /Locked private fields/);
  assert.match(output, /Attributes \/ certificates/);
  assert.match(output, /Chain proof/);
  assert.match(output, /IPFS proof/);
  assert.match(output, /Metadata hash verification/);
  assert.match(output, /✅ Metadata hash verified/);
  assert.match(output, /Developer \/ Raw JSON/);
  const developerIndex = output.indexOf(
    "<summary>Developer / Raw JSON</summary>",
  );
  const rawPreIndex = output.indexOf('<pre class="code">');
  assert.ok(developerIndex >= 0);
  assert.ok(rawPreIndex > developerIndex);
  assert.doesNotMatch(
    output.slice(0, developerIndex),
    /<pre class="code">/,
  );
});

test("confirmed mint preserves IPFS hash mismatch without cache substitution", async () => {
  const { context, elements } = createApplicationContext();
  const scenario = installControlledMintScenario(context, {
    readMode: "mismatch",
  });
  context.cacheReadCount = 0;

  vm.runInContext(inlineApplicationSource(), context);
  vm.runInContext(
    "loadMintedMetadataCache=()=>{cacheReadCount+=1;return {metadata:{name:'Cached'}};}",
    context,
  );
  await vm.runInContext("refreshWalletState(false)", context);
  await vm.runInContext("doSign()", context);

  const chainState = vm.runInContext(
    "JSON.parse(JSON.stringify(state.chain))",
    context,
  );
  assert.equal(scenario.metadataFetchCount, 1);
  assert.equal(scenario.mintCallCount, 1);
  assert.equal(chainState.passportStatus, "hash-mismatch");
  assert.equal(chainState.metadataSource, "ipfs");
  assert.equal(chainState.metadataVerification.matches, false);
  assert.equal(context.cacheReadCount, 0);
  assert.match(elements.get("main").innerHTML, /⚠️ Metadata hash mismatch/);
  assert.match(elements.get("main").innerHTML, /Chain proof/);
  assert.match(elements.get("main").innerHTML, /等待鏈上確認/);
});

test("confirmed mint uses clearly labeled local cache only after IPFS failure", async () => {
  const { context, elements } = createApplicationContext();
  const scenario = installControlledMintScenario(context, {
    readMode: "failure",
  });

  vm.runInContext(inlineApplicationSource(), context);
  await vm.runInContext("refreshWalletState(false)", context);
  await vm.runInContext("doSign()", context);

  const chainState = vm.runInContext(
    "JSON.parse(JSON.stringify(state.chain))",
    context,
  );
  assert.equal(scenario.metadataFetchCount, 1);
  assert.equal(chainState.passportStatus, "local-cache-fallback");
  assert.equal(chainState.metadataSource, "local-cache-fallback");
  assert.equal(chainState.metadataVerification.matches, true);
  assert.match(chainState.metadataFetchError, /metadata 服務|unavailable/i);
  assert.match(
    elements.get("main").innerHTML,
    /Local cache fallback — not IPFS source data/,
  );
  assert.match(elements.get("main").innerHTML, /Cache hash matches minted hash/);
  assert.doesNotMatch(elements.get("main").innerHTML, /verified IPFS data/i);
});

test("confirmed mint keeps chain proof and marks Passport unavailable when no source exists", async () => {
  const { context, elements } = createApplicationContext();
  const scenario = installControlledMintScenario(context, {
    readMode: "failure",
    emitTokenId: false,
  });

  vm.runInContext(inlineApplicationSource(), context);
  await vm.runInContext("refreshWalletState(false)", context);
  await vm.runInContext("doSign()", context);

  const chainState = vm.runInContext(
    "JSON.parse(JSON.stringify(state.chain))",
    context,
  );
  assert.equal(scenario.metadataFetchCount, 1);
  assert.equal(chainState.status, "confirmed");
  assert.equal(chainState.passportStatus, "unavailable");
  assert.equal(chainState.tx, "0xfeed1234");
  assert.match(elements.get("main").innerHTML, /0xfeed1234/);
  assert.match(elements.get("main").innerHTML, /Passport metadata unavailable/);
  assert.match(elements.get("main").innerHTML, /Chain proof/);
  assert.match(elements.get("main").innerHTML, /等待鏈上確認/);
});

test("confirmed page keeps the timeline visible while Passport metadata loads", async () => {
  const { context, elements } = createApplicationContext();
  const scenario = installControlledMintScenario(context, {
    readMode: "deferred",
  });

  vm.runInContext(inlineApplicationSource(), context);
  await vm.runInContext("refreshWalletState(false)", context);
  const signingPromise = vm.runInContext("doSign()", context);
  for (let attempt = 0; attempt < 5 && scenario.metadataFetchCount === 0; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  const loadingState = vm.runInContext(
    "JSON.parse(JSON.stringify(state.chain))",
    context,
  );
  assert.equal(loadingState.status, "confirmed");
  assert.equal(loadingState.passportStatus, "loading");
  assert.match(elements.get("main").innerHTML, /Loading verified DPP Passport/);
  assert.match(elements.get("main").innerHTML, /等待鏈上確認/);
  assert.match(elements.get("main").innerHTML, /Chain proof/);

  scenario.resolveMetadataFetch();
  await signingPromise;
});

test("real upload failure stops before contract minting", async () => {
  const { context, elements } = createApplicationContext();
  const account = "0x1234567890123456789012345678901234567890";
  let mintCallCount = 0;

  context.fetch = async () => {
    throw new Error("backend offline");
  };
  context.ethereum = {
    on() {},
    async request({ method }) {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return [account];
      }
      if (method === "eth_chainId") return "0xaa36a7";
      throw new Error(`Unexpected wallet method: ${method}`);
    },
  };
  context.ethers = {
    ZeroAddress: "0x0000000000000000000000000000000000000000",
    isAddress() {
      return true;
    },
    toUtf8Bytes(value) {
      return `utf8:${value}`;
    },
    keccak256(value) {
      return `hash:${value}`;
    },
    BrowserProvider: class {
      async getNetwork() {
        return { chainId: 11155111n };
      }
      async getSigner() {
        return {
          async getAddress() {
            return account;
          },
        };
      }
    },
    Contract: class {
      async mintDPP() {
        mintCallCount += 1;
        throw new Error("mintDPP must not be called");
      }
    },
  };

  vm.runInContext(inlineApplicationSource(), context);
  await vm.runInContext("refreshWalletState(false)", context);
  await vm.runInContext("doSign()", context);

  const chainState = vm.runInContext(
    "JSON.parse(JSON.stringify(state.chain))",
    context,
  );
  assert.equal(mintCallCount, 0);
  assert.equal(chainState.status, "error");
  assert.equal(chainState.backendStatus, "upload failed");
  assert.equal(chainState.tx, null);
  assert.equal(chainState.tokenURI, null);
  assert.doesNotMatch(JSON.stringify(chainState), /bafy-demo-cid/);
  assert.match(elements.get("main").innerHTML, /Backend status:<b>upload failed<\/b>/);
});

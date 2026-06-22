# IPFS DPP Passport Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch confirmed NFT metadata through the local IPFS backend, verify it against the minted hash, and render a polished DPP Passport on the existing `上鏈狀態` page.

**Architecture:** `server.js` will normalize supported token URIs to a CID and safe path, rebuild a trusted gateway URL, and fetch JSON with a timeout. `factory-endpoint.html` will run an IPFS-first Passport state machine after transaction confirmation, preserve hash mismatches as integrity failures, use token-scoped localStorage only after fetch failures, and render structured Passport cards with collapsed developer data.

**Tech Stack:** Plain HTML/CSS/JavaScript, ethers.js v6, Node.js, Express, Node built-in test runner.

---

## File map

- Modify `server.js`: safe IPFS URI parsing, trusted gateway URL rebuilding,
  timeout-bound metadata fetching, and `GET /fetch-metadata`.
- Modify `tests/ipfs-server.test.mjs`: backend normalization, safety, timeout,
  JWT independence, success, and failure tests.
- Modify `factory-endpoint.html`: read endpoint configuration, fetch and hash
  helpers, Passport state resolution, Passport renderer, and styling.
- Modify `tests/dpp-demo.test.mjs`: IPFS-first behavior, all five states,
  mismatch protection, cache fallback, and Passport UI tests.
- Modify `agent.md`: readback architecture, verification semantics, manual
  commands, validation results, limitations, and source-of-truth wording.

### Task 1: Safe backend IPFS metadata reader

**Files:**
- Modify: `tests/ipfs-server.test.mjs`
- Modify: `server.js`

- [ ] **Step 1: Write failing normalization and SSRF-safety tests**

Add tests that import `normalizeIPFSTokenURI` and assert:

```js
assert.deepEqual(
  normalizeIPFSTokenURI("ipfs://bafy-test/path/file.json"),
  {
    cid: "bafy-test",
    path: "path/file.json",
    tokenURI: "ipfs://bafy-test/path/file.json",
  },
);

assert.deepEqual(
  normalizeIPFSTokenURI("https://untrusted.example/ipfs/bafy-test/path/file.json"),
  {
    cid: "bafy-test",
    path: "path/file.json",
    tokenURI: "ipfs://bafy-test/path/file.json",
  },
);

assert.throws(
  () => normalizeIPFSTokenURI("https://example.com/private"),
  /IPFS token URI/,
);
assert.throws(
  () => normalizeIPFSTokenURI("http://127.0.0.1:9999/ipfs/bafy-test"),
  /IPFS token URI/,
);
assert.throws(
  () => normalizeIPFSTokenURI("ipfs://bafy-test/../secret"),
  /path/,
);
```

- [ ] **Step 2: Run the backend tests and verify RED**

Run:

```bash
node --test tests/ipfs-server.test.mjs
```

Expected: failures because `normalizeIPFSTokenURI` is not exported.

- [ ] **Step 3: Implement token URI normalization and gateway rebuilding**

In `server.js`, add:

```js
function normalizeIPFSTokenURI(tokenURI) {
  if (typeof tokenURI !== "string" || !tokenURI.trim()) {
    throw exposedError(400, "tokenURI is required.");
  }

  const value = tokenURI.trim();
  let cid;
  let rawPath = "";

  if (value.startsWith("ipfs://")) {
    const remainder = value.slice("ipfs://".length);
    [cid, ...pathParts] = remainder.split("/");
    rawPath = pathParts.join("/");
  } else {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
      throw exposedError(400, "Unsupported IPFS token URI.");
    }
    const marker = "/ipfs/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) {
      throw exposedError(400, "HTTPS tokenURI must contain an /ipfs/ path.");
    }
    const remainder = parsed.pathname.slice(markerIndex + marker.length);
    [cid, ...pathParts] = remainder.split("/");
    rawPath = pathParts.join("/");
  }

  const path = normalizeIPFSPath(rawPath);
  validateCID(cid);
  return {
    cid,
    path,
    tokenURI: `ipfs://${cid}${path ? `/${path}` : ""}`,
  };
}
```

Use local declarations rather than implicit globals, reject malformed percent
encoding and traversal, allow only CID-safe characters, and construct:

```js
function gatewayURLForIPFSResource(resource, configuredGateway) {
  const base = gatewayURLForCID(resource.cid, configuredGateway);
  return resource.path
    ? `${base}/${resource.path.split("/").map(encodeURIComponent).join("/")}`
    : base;
}
```

- [ ] **Step 4: Run normalization tests and verify GREEN**

Run:

```bash
node --test tests/ipfs-server.test.mjs
```

Expected: the new normalization tests pass.

- [ ] **Step 5: Write failing fetch-handler tests**

Add tests for `createFetchMetadataHandler`:

```js
test("metadata reader does not require PINATA_JWT and preserves CID paths", async () => {
  let upstreamURL = null;
  const handler = createFetchMetadataHandler({
    env: { PINATA_GATEWAY: "https://trusted.example/ipfs" },
    gatewayFetch: async (url) => {
      upstreamURL = url;
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
    { query: { tokenURI: "ipfs://bafy-test/path/file.json" } },
    response,
  );

  assert.equal(
    upstreamURL,
    "https://trusted.example/ipfs/bafy-test/path/file.json",
  );
  assert.deepEqual(response.body, {
    metadata: { name: "Fetched DPP" },
    source: "ipfs",
    tokenURI: "ipfs://bafy-test/path/file.json",
    gatewayURL: "https://trusted.example/ipfs/bafy-test/path/file.json",
    fetchedAt: "2026-06-22T00:00:00.000Z",
  });
});
```

Also test missing `tokenURI` returns 400, gateway non-2xx returns a safe 502,
invalid JSON returns a safe 502, and an aborted fetch returns a timeout message.

- [ ] **Step 6: Run fetch-handler tests and verify RED**

Run:

```bash
node --test tests/ipfs-server.test.mjs
```

Expected: failures because `createFetchMetadataHandler` and the route do not
exist.

- [ ] **Step 7: Implement the timeout-bound metadata handler**

Add:

```js
const IPFS_FETCH_TIMEOUT_MS = 10000;

function createFetchMetadataHandler({
  env = process.env,
  gatewayFetch = global.fetch,
  now = () => new Date(),
  timeoutMs = IPFS_FETCH_TIMEOUT_MS,
  logger = console,
} = {}) {
  return async function fetchMetadataHandler(req, res) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resource = normalizeIPFSTokenURI(req.query.tokenURI);
      const gatewayURL = gatewayURLForIPFSResource(
        resource,
        env.PINATA_GATEWAY,
      );
      const upstream = await gatewayFetch(gatewayURL, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      const responseText = await upstream.text();
      const metadata = JSON.parse(responseText);
      if (!upstream.ok || !isMetadataObject(metadata)) {
        throw new Error("IPFS gateway did not return a metadata JSON object.");
      }
      return res.status(200).json({
        metadata,
        source: "ipfs",
        tokenURI: resource.tokenURI,
        gatewayURL,
        fetchedAt: now().toISOString(),
      });
    } catch (error) {
      logger.error("IPFS metadata fetch failed:", error);
      const clientError = safeMetadataFetchError(error);
      return res.status(clientError.statusCode).json({
        error: clientError.message,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}
```

Register:

```js
app.get("/fetch-metadata", createFetchMetadataHandler(options));
```

Export the normalization, URL builder, handler, and timeout constant.

- [ ] **Step 8: Run backend tests and verify GREEN**

Run:

```bash
node --test tests/ipfs-server.test.mjs
```

Expected: all backend tests pass without real network requests.

- [ ] **Step 9: Commit the backend reader**

```bash
git add server.js tests/ipfs-server.test.mjs
git commit -m "Add safe IPFS metadata reader"
```

### Task 2: Frontend metadata loading and integrity state machine

**Files:**
- Modify: `tests/dpp-demo.test.mjs`
- Modify: `factory-endpoint.html`

- [ ] **Step 1: Write failing helper tests**

Extend the metadata-helper VM exports and add tests for:

```js
assert.match(
  html,
  /const\s+IPFS_METADATA_FETCH_ENDPOINT\s*=\s*['"]http:\/\/localhost:3001\/fetch-metadata['"]/,
);
```

Mock a successful backend response and verify:

```js
const result = await helpers.fetchMetadataFromIPFS(
  "ipfs://bafy-test/path/file.json",
);
assert.equal(
  request.url,
  "http://localhost:3001/fetch-metadata?tokenURI=ipfs%3A%2F%2Fbafy-test%2Fpath%2Ffile.json",
);
assert.equal(result.source, "ipfs");
```

Test `verifyMetadataHash(metadata, expectedHash)` returns canonical JSON,
computed hash, expected hash, and `matches`.

- [ ] **Step 2: Run frontend tests and verify RED**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: failures because the read endpoint and helpers are missing.

- [ ] **Step 3: Implement read and verification helpers**

Add:

```js
const IPFS_METADATA_FETCH_ENDPOINT =
  'http://localhost:3001/fetch-metadata';

async function fetchMetadataFromIPFS(tokenURI) {
  const url = `${IPFS_METADATA_FETCH_ENDPOINT}?tokenURI=${encodeURIComponent(tokenURI)}`;
  const response = await fetch(url);
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `IPFS metadata fetch failed (HTTP ${response.status}).`);
  }
  if (!result?.metadata || result.source !== 'ipfs') {
    throw new Error('IPFS metadata service returned an invalid response.');
  }
  return result;
}

function verifyMetadataHash(metadata, expectedHash) {
  const canonicalJson = stableStringify(metadata);
  const computedHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalJson));
  return {
    canonicalJson,
    computedHash,
    expectedHash,
    matches: computedHash.toLowerCase() === String(expectedHash).toLowerCase(),
  };
}
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: helper tests pass.

- [ ] **Step 5: Write failing Passport state tests**

Add controlled `doSign()` tests for:

- matching IPFS response → `verified-ipfs`
- mismatching IPFS response → `hash-mismatch`, with
  `loadMintedMetadataCache()` not called
- IPFS failure with token cache → `local-cache-fallback`
- IPFS failure without cache → `unavailable`

For matching metadata, mock fetch in sequence:

```js
if (url === "http://localhost:3001/upload-metadata") {
  return uploadResponse;
}
if (url.startsWith("http://localhost:3001/fetch-metadata?")) {
  return metadataReadResponse;
}
```

Assert the confirmed chain state stores:

```js
assert.equal(chainState.passportStatus, "verified-ipfs");
assert.equal(chainState.metadataSource, "ipfs");
assert.equal(chainState.fetchedMetadata.name, metadata.name);
assert.equal(chainState.metadataVerification.matches, true);
```

- [ ] **Step 6: Run state tests and verify RED**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: failures because Passport states are not populated.

- [ ] **Step 7: Implement `loadConfirmedPassport()`**

Add state fields:

```js
passportStatus: null,
fetchedMetadata: null,
metadataSource: null,
metadataGatewayURL: null,
metadataFetchedAt: null,
metadataVerification: null,
metadataFetchError: null,
```

Implement:

```js
async function loadConfirmedPassport() {
  const c = state.chain;
  c.passportStatus = 'loading';
  render();
  try {
    const fetched = await fetchMetadataFromIPFS(c.tokenURI);
    c.fetchedMetadata = fetched.metadata;
    c.metadataSource = fetched.source;
    c.metadataGatewayURL = fetched.gatewayURL || null;
    c.metadataFetchedAt = fetched.fetchedAt || null;
    c.metadataVerification = verifyMetadataHash(
      fetched.metadata,
      c.metadataHash,
    );
    c.passportStatus = c.metadataVerification.matches
      ? 'verified-ipfs'
      : 'hash-mismatch';
  } catch (error) {
    c.metadataFetchError = walletErrorMessage(
      error,
      'IPFS metadata is unavailable.',
    );
    const cached = c.tokenId ? loadMintedMetadataCache(c.tokenId) : null;
    if (cached?.metadata) {
      c.fetchedMetadata = cached.metadata;
      c.metadataSource = 'local-cache-fallback';
      c.metadataFetchedAt = cached.savedAt || null;
      c.metadataVerification = verifyMetadataHash(
        cached.metadata,
        c.metadataHash,
      );
      c.passportStatus = 'local-cache-fallback';
    } else {
      c.passportStatus = 'unavailable';
    }
  }
  render();
}
```

After cache save and initial confirmed render in `doSign()`, call:

```js
await loadConfirmedPassport();
```

Do not throw a Passport read failure into the mint failure handler after the
transaction has already confirmed.

- [ ] **Step 8: Run state tests and verify GREEN**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: all five state paths pass, including no cache read on mismatch.

- [ ] **Step 9: Commit the state machine**

```bash
git add factory-endpoint.html tests/dpp-demo.test.mjs
git commit -m "Add verified Passport metadata loading"
```

### Task 3: Passport renderer and polished styling

**Files:**
- Modify: `tests/dpp-demo.test.mjs`
- Modify: `factory-endpoint.html`

- [ ] **Step 1: Write failing Passport UI tests**

Add assertions that confirmed verified output contains:

```js
assert.match(output, /DPP Passport/);
assert.match(output, /Product \/ order overview/);
assert.match(output, /Public production data/);
assert.match(output, /Locked private fields/);
assert.match(output, /Attributes \/ certificates/);
assert.match(output, /Chain proof/);
assert.match(output, /IPFS proof/);
assert.match(output, /✅ Metadata hash verified/);
assert.match(output, /Developer \/ Raw JSON/);
```

Assert the first `<pre class="code">` occurs after
`<summary>Developer / Raw JSON</summary>`, and no raw metadata JSON is visible
before the details section.

Add state-specific assertions:

```js
assert.match(fallbackOutput, /Local cache fallback — not IPFS source data/);
assert.doesNotMatch(fallbackOutput, /verified IPFS/i);
assert.match(mismatchOutput, /⚠️ Metadata hash mismatch/);
assert.match(unavailableOutput, /Passport metadata unavailable/);
```

- [ ] **Step 2: Run UI tests and verify RED**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: failures because the Passport renderer and styles do not exist.

- [ ] **Step 3: Add Passport CSS**

Add focused classes inside the existing `<style>`:

```css
.passport{display:grid;gap:14px;margin-top:16px}
.passport-hero{padding:22px;background:linear-gradient(135deg,#eef0fb,#fff);border:1px solid #d9ddf6;border-radius:16px}
.passport-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.passport-section{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow)}
.passport-section.wide{grid-column:1/-1}
.passport-kv{display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1.4fr);gap:12px;padding:8px 0;border-top:1px solid var(--lineSoft)}
.passport-kv:first-child{border-top:0}
.passport-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.passport-metric{padding:12px;border:1px solid var(--lineSoft);border-radius:11px;background:var(--surface2)}
.passport-badge{display:inline-flex;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800}
.passport-badge.public{background:var(--goodBg);color:var(--good)}
.passport-badge.private,.passport-badge.encrypted{background:var(--jewelBg);color:var(--jewel)}
.passport-proof.good{border-color:#cfe6d4;background:var(--goodBg)}
.passport-proof.warn{border-color:#f0dcc0;background:var(--warnBg)}
.passport-locked{border-left:4px solid var(--jewel);background:var(--jewelBg)}
@media(max-width:760px){.passport-grid{grid-template-columns:1fr}.passport-kv{grid-template-columns:1fr}}
```

- [ ] **Step 4: Implement rendering helpers**

Add small escaped renderers:

```js
function passportRows(object) { ... }
function passportAttributes(attributes) { ... }
function vChainProof(c) { ... }
function vIPFSProof(c) { ... }
function vMetadataVerification(c) { ... }
function vDeveloperMetadata(c, metadata) { ... }
function vDPPPassport(metadata, verification, c) { ... }
function vPassportBody(c) { ... }
```

`vPassportBody()` switches only on:

```js
loading
verified-ipfs
hash-mismatch
local-cache-fallback
unavailable
```

The full Passport is rendered for verified, mismatch, and cache fallback
states. Loading and unavailable retain the timeline and chain proof.

- [ ] **Step 5: Replace raw confirmed content with Passport-first content**

In `vChain()`:

- keep the existing stepper and timeline
- keep transaction confirmation state
- replace the default-visible raw JSON block with `${vPassportBody(c)}`
- move upload diagnostics, fetch diagnostics, pretty JSON, canonical JSON,
  cache note, and cache key into `vDeveloperMetadata()`

- [ ] **Step 6: Run UI tests and verify GREEN**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: Passport sections and all state-specific labels pass.

- [ ] **Step 7: Commit the Passport UI**

```bash
git add factory-endpoint.html tests/dpp-demo.test.mjs
git commit -m "Render polished DPP Passport"
```

### Task 4: Documentation and complete validation

**Files:**
- Modify: `agent.md`

- [ ] **Step 1: Update architecture and run instructions**

Document:

```text
tokenURI
→ GET /fetch-metadata
→ trusted gateway fetch
→ stableStringify
→ keccak256
→ compare with minted metadataHash
→ Passport state
```

Add the manual read command:

```bash
curl -sS "http://localhost:3001/fetch-metadata?tokenURI=ipfs://YOUR_CID"
```

State explicitly:

- IPFS JSON is the source metadata document.
- The minted metadata hash verifies that document.
- A mismatch is an integrity warning and never triggers cache substitution.
- localStorage is only a convenience fallback after IPFS failure.
- Raw JSON is available only in `Developer / Raw JSON`.

- [ ] **Step 2: Run the full automated suite**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: all tests pass with zero failures and no real Pinata/IPFS requests.

- [ ] **Step 3: Run static and secret checks**

Run:

```bash
git diff --check
git check-ignore -v .env node_modules
rg -n --hidden \
  --glob '!.env' \
  --glob '!node_modules/**' \
  --glob '!package-lock.json' \
  '(PINATA_JWT\s*[=:]\s*[^[:space:]]+|Bearer\s+[A-Za-z0-9._-]{20,}|PRIVATE_KEY\s*[=:]\s*[^[:space:]]+)' .
```

Expected: no whitespace errors; `.env` and `node_modules` are ignored; matches
are only documentation placeholders or test fixtures.

- [ ] **Step 4: Validate the backend locally**

Start:

```bash
npm start
```

Run:

```bash
curl -sS "http://localhost:3001/fetch-metadata?tokenURI=ipfs://YOUR_VALIDATION_CID"
```

Expected: metadata JSON, normalized `tokenURI`, trusted `gatewayURL`, source
`ipfs`, and `fetchedAt`.

- [ ] **Step 5: Validate the Passport in a browser**

From the project root:

```bash
conda run -n codex python -m http.server 3000 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:3000/factory-endpoint.html
```

Use a controlled confirmed state without submitting a wallet transaction.
Verify the timeline, all Passport sections, collapsed developer details,
responsive layout, and zero console errors.

- [ ] **Step 6: Update `agent.md` with measured evidence**

Record exact test totals, local endpoint result, browser checks, limitations,
and the fact that no additional mint was submitted during validation.

- [ ] **Step 7: Commit documentation and validation**

```bash
git add agent.md
git commit -m "Document DPP Passport verification"
```

- [ ] **Step 8: Push the completed branch**

Run:

```bash
git push origin main
```

Expected: local `main` and `origin/main` point to the completed Passport
implementation.

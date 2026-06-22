# Stage 1 Metadata Display and Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the exact submitted DPP metadata after mint and preserve a token-scoped local demo copy while IPFS remains mocked.

**Architecture:** Keep all runtime behavior in `factory-endpoint.html`. Add pure cache helpers beside the existing metadata helpers, enrich `state.chain` during `doSign()`, persist only after confirmation with a parsed token ID, and render escaped pretty/canonical JSON in the current chain view.

**Tech Stack:** Static HTML/CSS/JavaScript, browser localStorage, ethers.js v6, Node built-in tests.

---

### Task 1: Add failing cache and UI tests

**Files:**
- Modify: `tests/dpp-demo.test.mjs`

- [ ] **Step 1: Give the VM a localStorage test double**

Add a `Map`-backed object implementing `setItem`, `getItem`, and `removeItem`.
Return the map from `createApplicationContext()` so confirmed-mint tests can
inspect saved JSON.

- [ ] **Step 2: Test cache helper behavior**

Expose `metadataCacheKey`, `saveMintedMetadataCache`, and
`loadMintedMetadataCache` from the helper VM. Verify the exact key:

```text
dpp-demo-metadata:0x24aeeb254a48820b5b0bdcbdce980a725535718f:77
```

Verify the saved record includes contract address, token ID, transaction hash,
token URI, metadata hash, metadata, canonical JSON, `savedAt`, and
`LOCAL_DEMO_CACHE_ONLY_NOT_ON_CHAIN`.

- [ ] **Step 3: Test the confirmed mint flow and UI**

Extend the controlled `doSign()` test to assert:

```js
state.chain.metadata
state.chain.canonicalJson
state.chain.metadataCacheKey
```

Also assert that the rendered chain view contains:

```text
本次送出的 DPP Metadata JSON
Canonical JSON used for metadataHash
LOCAL_DEMO_CACHE_ONLY_NOT_ON_CHAIN
```

and does not claim that full JSON is stored on-chain.

- [ ] **Step 4: Run the red test**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: failures because the cache helpers and metadata UI do not exist.

### Task 2: Implement metadata state and local cache

**Files:**
- Modify: `factory-endpoint.html`

- [ ] **Step 1: Add cache helpers**

Implement:

```js
function metadataCacheKey(tokenId) {
  return `dpp-demo-metadata:${CONTRACT_ADDRESS}:${tokenId}`;
}
```

`saveMintedMetadataCache()` must write the required record and return the cache
key. `loadMintedMetadataCache()` must parse the record and return `null` for
missing or invalid data.

- [ ] **Step 2: Enrich mint state**

Initialize `metadata`, `canonicalJson`, and `metadataCacheKey` to `null`. After
metadata hashing, assign:

```js
state.chain.metadata = metadata;
state.chain.canonicalJson = hashes.canonicalJson;
```

- [ ] **Step 3: Save only confirmed token-linked metadata**

After receipt parsing and status confirmation:

```js
if (tokenId) {
  state.chain.metadataCacheKey =
    saveMintedMetadataCache(tokenId, state.chain);
}
```

Storage errors must be logged without changing the confirmed mint status.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: cache and state tests pass; UI tests remain red until Task 3.

### Task 3: Render metadata and document storage boundaries

**Files:**
- Modify: `factory-endpoint.html`
- Modify: `agent.md`

- [ ] **Step 1: Render escaped pretty metadata**

When `c.metadata` exists, add:

```html
<h3>本次送出的 DPP Metadata JSON</h3>
<pre class="code">...</pre>
```

using `escapeHTML(JSON.stringify(c.metadata, null, 2))`.

- [ ] **Step 2: Render canonical JSON in details**

Add a `<details>` block titled
`Canonical JSON used for metadataHash`, with escaped `c.canonicalJson`.

- [ ] **Step 3: Explain data location**

Add a callout stating that the chain stores the URI, hashes, record fields,
issuer, and timestamp, while the full JSON currently remains in frontend
memory/localStorage because IPFS upload is mocked.

- [ ] **Step 4: Add future-read TODO comments**

Document chain-first, real-tokenURI, local-cache fallback, and unavailable
states without implementing event scanning.

- [ ] **Step 5: Update `agent.md`**

Record the new UI, canonical JSON display, local-only cache, limitations, and
the future real IPFS/Arweave read path.

- [ ] **Step 6: Run final verification**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Then serve through the existing `codex` conda environment and confirm
`factory-endpoint.html` returns HTTP 200. Scan for credential assignments and
for language that incorrectly claims full metadata JSON is on-chain.

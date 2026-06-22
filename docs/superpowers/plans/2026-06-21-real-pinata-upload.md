# Real Pinata Metadata Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload Stage 1 DPP metadata to Pinata through a local credential-safe backend before minting on Sepolia.

**Architecture:** Keep the browser UI static and add an Express proxy on port 3001. The frontend defaults to the proxy, retains an explicit mock flag, and treats localStorage as a cache while real IPFS plus metadataHash becomes the metadata source of truth.

**Tech Stack:** Static HTML/JavaScript, Node.js, Express, CORS, dotenv, Pinata JSON API, Node built-in tests.

---

### Task 1: Add failing frontend and backend tests

**Files:**
- Modify: `tests/dpp-demo.test.mjs`
- Create: `tests/ipfs-server.test.mjs`

- [ ] **Step 1: Test frontend configuration and real upload**

Assert that `USE_MOCK_IPFS` defaults to `false`, the endpoint is
`http://localhost:3001/upload-metadata`, and a controlled `fetch` receives a
JSON POST and returns the backend CID, token URI, and gateway URL.

- [ ] **Step 2: Test explicit mock mode and upload failure**

Run `uploadMetadataToIPFS()` with `USE_MOCK_IPFS = true` and assert the old
deterministic demo result. In real mode, assert an unavailable or non-OK backend
rejects without returning a fake URI.

- [ ] **Step 3: Test backend behavior without real Pinata**

Import the server handler factory and use mock request/response objects. Assert
that missing `PINATA_JWT` returns a readable 503 response. Inject a successful
Pinata fetch response and assert request headers/body plus returned CID,
`ipfs://` URI, and gateway URL.

- [ ] **Step 4: Run red tests**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: failures because the backend and real frontend upload mode do not
exist.

### Task 2: Implement the local Pinata proxy

**Files:**
- Create: `server.js`
- Create: `package.json`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Add package configuration**

Use `express`, `cors`, and `dotenv`, with:

```json
"start": "node server.js",
"test": "node --test tests/*.test.mjs"
```

- [ ] **Step 2: Add environment safety**

Ignore `.env` and `node_modules/`. Add only blank values to `.env.example`:

```env
PINATA_JWT=
PINATA_GATEWAY=
PORT=3001
```

- [ ] **Step 3: Implement testable upload behavior**

Export app and handler factories. Reject missing JWT and invalid metadata,
construct the required Pinata request, validate `IpfsHash`, and return safe
JSON. Start the server only when `server.js` is executed directly.

- [ ] **Step 4: Install dependencies and run backend tests**

Run:

```bash
npm install
npm test
```

Expected: backend and existing frontend tests pass without contacting Pinata.

### Task 3: Switch the frontend to real upload by default

**Files:**
- Modify: `factory-endpoint.html`
- Modify: `tests/dpp-demo.test.mjs`

- [ ] **Step 1: Add upload configuration**

Add:

```js
const USE_MOCK_IPFS = false;
const IPFS_UPLOAD_ENDPOINT = 'http://localhost:3001/upload-metadata';
```

- [ ] **Step 2: Implement conditional upload**

Return the old demo URI only when mock mode is explicitly enabled. Otherwise
POST metadata to the backend, validate its response, and throw readable errors
for connection, status, or malformed-response failures.

- [ ] **Step 3: Store and display gateway URL**

Add `gatewayURL` to chain state, display a safe external link, and update upload
progress text and cache/source-of-truth wording based on the mode.

- [ ] **Step 4: Keep mint/cache behavior green**

Update controlled wallet tests to mock only the local backend response and
confirm the real URI reaches `mintDPP`, while localStorage caching still occurs
after confirmation.

### Task 4: Update documentation and verify

**Files:**
- Modify: `agent.md`
- Modify: `2stage-demo.md`

- [ ] **Step 1: Document setup and security**

Document frontend and backend startup, `.env` creation, Pinata JWT placement,
the complete upload/mint flow, and manual steps.

- [ ] **Step 2: Document the intermediate architecture**

Explain that the local upload proxy is the bridge between Stage 1
browser-wallet minting and Stage 2 backend-controlled minting.

- [ ] **Step 3: Run final checks**

Run all tests, start the backend without a JWT and verify its health/error
behavior, serve the frontend and check HTTP 200, and scan tracked files for
credential assignments. Do not call real Pinata.

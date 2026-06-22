# Static EVM DPP Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing static factory endpoint prototype into a browser-wallet Sepolia NFT mint demo with a Remix-deployable ERC-721 contract.

**Architecture:** Preserve the single HTML file and its existing `FIELDS` state. Add pinned ethers.js v6, inline wallet/metadata/mint helpers, and a focused Solidity contract; validate pure behavior with Node's built-in test runner and validate page loading through a local static server.

**Tech Stack:** Static HTML/CSS/JavaScript, ethers.js 6.17.0 UMD, EIP-1193 injected wallets, Solidity 0.8.24, OpenZeppelin Contracts 5.x, Remix, Node built-in tests.

---

### Task 1: Add failing validation tests

**Files:**
- Create: `tests/dpp-demo.test.mjs`
- Inspect: `factory-endpoint.html`
- Inspect: `contracts/SimpleDPPNFT.sol`

- [ ] **Step 1: Write tests for the required contract and frontend surface**

Create Node tests that read the source files and assert:

- `SimpleDPPNFT` inherits `ERC721URIStorage`.
- `DPPRecord`, `mintDPP`, and `DPPMinted` contain every required field.
- The HTML loads ethers.js v6 and defines the contract/network config.
- The HTML defines `connectWallet`, `switchToSepolia`,
  `buildMetadataJson`, `stableStringify`, `computeDPPHashes`,
  `uploadMetadataToIPFS`, and asynchronous `doSign`.
- `doSign` contains `BrowserProvider`, `getSigner`, `mintDPP`, `wait`, and
  event parsing.

- [ ] **Step 2: Add executable helper tests**

Extract `stableStringify`, `buildMetadataJson`, and
`uploadMetadataToIPFS` from the inline script into a Node VM with controlled
`FIELDS` fixtures. Assert recursively sorted keys, public/private partitioning,
demo-only encryption labeling, and the exact mock token URI.

- [ ] **Step 3: Run tests and verify the red state**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: failures because the Solidity contract and EVM helper functions do not
yet exist.

### Task 2: Add the Solidity DPP NFT contract

**Files:**
- Create: `contracts/SimpleDPPNFT.sol`

- [ ] **Step 1: Implement the minimum contract**

Add a Solidity 0.8.24 contract importing:

```solidity
import {ERC721URIStorage} from
    "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
```

Define `DPPRecord`, `dppRecords`, `_nextTokenId`, `DPPMinted`, and the exact
requested `mintDPP(...)` function. Mint with `_safeMint`, set the token URI,
store all record fields, and emit the event.

- [ ] **Step 2: Run tests**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: contract-shape tests pass while frontend EVM tests remain red.

### Task 3: Add wallet state and Sepolia handling

**Files:**
- Modify: `factory-endpoint.html`

- [ ] **Step 1: Add ethers.js and configuration**

Load:

```html
<script src="https://cdn.jsdelivr.net/npm/ethers@6.17.0/dist/ethers.umd.min.js"></script>
```

Add `CONTRACT_ADDRESS`, minimal human-readable `CONTRACT_ABI`,
`SEPOLIA_CHAIN_ID`, and `SEPOLIA_CHAIN_HEX`.

- [ ] **Step 2: Replace the fake wallet chip**

Use a button with `id="walletButton"` and a chip with
`id="networkStatus"`. Preserve the current top-bar layout.

- [ ] **Step 3: Implement wallet functions**

Add `connectWallet()`, `refreshWalletState()`, `renderWalletStatus()`,
`isSepolia()`, and `switchToSepolia()`. Register `accountsChanged` and
`chainChanged` once during initialization. Keep non-interactive initial account
discovery through `eth_accounts`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: wallet/config tests pass; metadata and mint tests may remain red.

### Task 4: Add metadata, canonical hashing, and mock IPFS

**Files:**
- Modify: `factory-endpoint.html`

- [ ] **Step 1: Implement stable canonical JSON**

Add a recursive `stableStringify(value)` that sorts object keys and preserves
array order.

- [ ] **Step 2: Implement metadata generation**

Add `buildMetadataJson()` using the live `FIELDS` array. Populate ERC-721
`name`, `description`, `attributes`, and the required `dpp` object. Keep private
attributes opaque and mark `encryptedData` values as demo-only placeholders.

- [ ] **Step 3: Implement hashing**

Add `computeDPPHashes(metadata)` using `ethers.toUtf8Bytes` and
`ethers.keccak256` for the canonical metadata and three fixed identifiers.

- [ ] **Step 4: Implement the mock IPFS boundary**

Add asynchronous `uploadMetadataToIPFS(metadata)` that logs the metadata and
returns the exact demo CID and token URI. Include a comment prohibiting frontend
API credentials.

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: canonical JSON, metadata partition, and mock IPFS tests pass.

### Task 5: Replace mock signing with a real mint transaction

**Files:**
- Modify: `factory-endpoint.html`

- [ ] **Step 1: Convert `doSign()` to asynchronous transaction flow**

Check wallet availability, connect if necessary, enforce Sepolia, validate the
contract address, build and hash metadata, obtain the mock token URI, create
`ethers.BrowserProvider`, obtain a signer, instantiate `ethers.Contract`, and
call `mintDPP`.

- [ ] **Step 2: Track real transaction state**

Store the real transaction hash as soon as it is returned. After `tx.wait()`,
parse receipt logs through `contract.interface.parseLog`; store the token ID
when a `DPPMinted` event is found, and still mark the transaction confirmed when
event parsing yields no token ID.

- [ ] **Step 3: Update chain status rendering**

Replace random token/hash/time values with real state. Display a Sepolia
Etherscan transaction link, metadata hash, token URI, confirmation state, and a
readable error when the operation fails.

- [ ] **Step 4: Add readable error mapping**

Handle missing wallets, EIP-1193 rejection code `4001`, unknown-chain code
`4902`, invalid/missing contract configuration, and transaction failures.
Log full errors to the console.

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/dpp-demo.test.mjs
```

Expected: all automated tests pass.

### Task 6: Browser validation and documentation

**Files:**
- Create: `agent.md`
- Modify: `factory-endpoint.html` only if validation exposes a defect

- [ ] **Step 1: Serve the project**

Use the existing shared utility conda environment, as required by the local
Python policy:

```bash
conda run -n codex python -m http.server 3000
```

- [ ] **Step 2: Validate in a browser**

Open `http://localhost:3000/factory-endpoint.html`. Confirm the page renders,
has no JavaScript syntax/runtime errors, and shows Not connected when no wallet
is exposed. Confirm the wallet button gives a readable missing-wallet message
in that environment.

- [ ] **Step 3: Scan for secrets**

Run:

```bash
rg -n -i "private.?key|mnemonic|pinata.?secret|api.?key|secret" .
```

Review every match and confirm it is documentation or a prohibition, not a
credential.

- [ ] **Step 4: Write `agent.md`**

Document changed files, implemented behavior, mocked behavior, local serving,
Remix deployment, address/ABI configuration, validation results, known issues,
manual wallet/transaction checks, and recommended production steps.

- [ ] **Step 5: Run final verification**

Run the full test command again and re-open the locally served page. Record
actual evidence in `agent.md`; do not claim that a Sepolia transaction was sent
unless a deployed address, funded wallet, and explicit user approval were
available.

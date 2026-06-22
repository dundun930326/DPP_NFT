# Static EVM DPP Demo Design

## Goal

Turn the existing single-file factory endpoint prototype into the shortest working
demo path from `factory-endpoint.html` to an injected EVM wallet, Sepolia, and a
real `SimpleDPPNFT.mintDPP()` transaction, while preserving the current UI.

## Constraints

- Keep `factory-endpoint.html` as the main runnable file.
- Keep frontend behavior inside its existing inline JavaScript.
- Load pinned ethers.js v6 from a browser-compatible CDN.
- Use `window.ethereum`; do not embed private keys, mnemonics, RPC credentials,
  IPFS credentials, or other secrets.
- Do not add Vite, React, Hardhat, Foundry, a backend, or package installation.
- Keep IPFS upload explicitly mocked in this version.
- Provide a standalone Solidity contract that can be deployed with Remix.

## Frontend Architecture

The existing `FIELDS` array remains the source of truth for DPP field values and
public/private disclosure choices. Targeted additions will provide:

1. A pinned ethers.js v6 UMD script loaded before the existing inline script.
2. A wallet state object containing the current account and chain ID.
3. A top-bar Connect Wallet control and a separate network-status chip.
4. Wallet functions for initial state discovery, interactive connection,
   `accountsChanged`, `chainChanged`, Sepolia detection, and network switching.
5. Pure metadata helpers:
   - `buildMetadataJson()`
   - `stableStringify()`
   - `computeDPPHashes()`
   - `uploadMetadataToIPFS()`
6. A real asynchronous `doSign()` that creates an ethers `BrowserProvider`,
   obtains a signer, calls `mintDPP()`, waits for confirmation, and parses the
   `DPPMinted` event.

The existing navigation, disclosure controls, preprocessing preview, boundary
screen, modal, and chain-status screen will be retained. Only their wallet and
on-chain behavior will change.

## Configuration

The inline JavaScript will contain a clearly marked configuration block:

- `CONTRACT_ADDRESS`, initially the zero-address sentinel.
- `CONTRACT_ABI`, limited to `mintDPP` and `DPPMinted`.
- `SEPOLIA_CHAIN_ID = 11155111`.
- `SEPOLIA_CHAIN_HEX = "0xaa36a7"`.

The frontend will reject the zero address and explain that the contract must be
deployed and configured before minting.

## Metadata and Hashing

`buildMetadataJson()` will build an ERC-721-style metadata object from the live
`FIELDS` disclosure state:

- Public field values go into `dpp.publicData`.
- Private field values go into `dpp.encryptedData` as strings visibly marked
  `ENC(DEMO_ONLY:...)`.
- Private attributes do not expose their raw values; their attribute value is
  shown as an encrypted placeholder.
- The document identifies the mock encryption as insecure and demo-only.
- DPP identity values are fixed to the current prototype:
  - schema: `dpp-dye-fnsh-v1`
  - order: `#A2207`
  - stage: `dye-fnsh`
  - previous token ID: `1041`
  - factory DID: `did:web:evergreen-dye.example`

`stableStringify()` recursively sorts object keys while preserving array order.
ethers.js computes:

- `metadataHash = keccak256(UTF-8 canonical JSON)`
- `schemaHash = keccak256(UTF-8 "dpp-dye-fnsh-v1")`
- `orderHash = keccak256(UTF-8 "#A2207")`
- `stage = keccak256(UTF-8 "dye-fnsh")`

## Mock IPFS Boundary

`uploadMetadataToIPFS(metadata)` logs the metadata and returns:

- CID: `bafy-demo-cid`
- token URI: `ipfs://bafy-demo-cid/metadata.json`

Comments and `agent.md` will state that this is not persistent storage and that
a later backend should hold any Pinata or Arweave credentials.

## Solidity Contract

`contracts/SimpleDPPNFT.sol` will use OpenZeppelin
`ERC721URIStorage`. It will:

- Mint sequential token IDs beginning at 1.
- Expose the requested `mintDPP(...)` signature.
- Store one `DPPRecord` per token ID.
- Record the caller as `issuer` and the block timestamp as `createdAt`.
- Emit `DPPMinted` with all requested values.
- Intentionally allow any caller to mint for this demo.

The lack of issuer access control will be documented as a production limitation.

## Error Handling and UI States

Readable UI messages will cover:

- No injected wallet.
- Rejected account access or transaction.
- Wrong network or rejected Sepolia switch.
- Missing/invalid contract address.
- Failed metadata upload placeholder.
- Reverted or failed mint.
- Confirmed transaction with event-derived token ID.
- Confirmed transaction without a parseable event.

Detailed error objects remain in the browser console.

## Validation

Automated source-level and pure-helper tests will verify contract shape,
configuration, canonical JSON behavior, metadata partitioning, mock IPFS output,
and required wallet/mint calls. Browser validation will serve the static page
over HTTP and verify that it loads without JavaScript errors and presents the
disconnected-wallet state. A real Sepolia transaction cannot be sent without a
deployed contract address, funded wallet, and explicit wallet approval, so that
portion will remain a documented manual validation step.

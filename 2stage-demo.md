# 2stage demo

## Overview

This project will use a two-stage demo strategy.

Stage 1 demonstrates the direct browser-wallet flow:

`factory-endpoint.html` → browser wallet → Sepolia → `SimpleDPPNFT.mintDPP()`

Stage 2 demonstrates the centralized platform auto-mint flow:

`factory-endpoint.html` → platform API/backend → IPFS/Arweave → platform signer wallet → Sepolia → `SimpleDPPNFT.mintDPP(to = platformWallet)`

The purpose of this document is to distinguish the current demo implementation from the longer-term platform architecture.

## Stage 1: Browser-wallet demo

The first-stage demo is intended for fast validation.

Flow:

1. The static HTML frontend builds DPP metadata JSON from the existing UI state.
2. Public fields are included as plaintext.
3. Private fields are represented as mock encrypted values for demo purposes.
4. The frontend computes a stable metadata hash.
5. IPFS upload is mocked.
6. The frontend connects to an EVM browser wallet through `window.ethereum`.
7. The wallet switches/checks Sepolia.
8. The frontend calls `SimpleDPPNFT.mintDPP()`.
9. The browser wallet, such as MetaMask or OKX Wallet, asks the user to confirm the transaction.
10. The UI displays the real transaction hash and tokenId if the `DPPMinted` event is parsed successfully.

Stage 1 is useful because it proves the shortest end-to-end path:

static HTML → wallet extension → Sepolia contract → NFT mint transaction

Limitations:

* It requires manual wallet confirmation.
* It is not suitable for batch automation.
* IPFS upload is still mocked.
* The current demo contract may allow unrestricted minting unless access control is added.
* Private fields are not truly encrypted yet.

# Second Stage: Platform-custodied auto-mint demo

## Confirmed direction

In Stage 2, DPP NFTs are minted by the centralized platform backend and are owned by the platform wallet.

The core flow is:

`factory-endpoint.html` → platform API/backend → IPFS/Arweave → platform signer wallet → Sepolia → `SimpleDPPNFT.mintDPP(to = platformWallet)`

This differs from Stage 1.

Stage 1:

* `msg.sender` = connected browser wallet
* `to` = connected browser wallet
* `ownerOf(tokenId)` = connected browser wallet
* user can discover owned DPP NFTs by connected wallet address

Stage 2:

* `msg.sender` = platform minter wallet
* `to` = platform custody wallet
* `ownerOf(tokenId)` = platform wallet
* factory/user-facing DPP ownership or assignment must be represented through platform index, metadata, or future contract fields

## Why platform-custodied minting

Stage 2 uses platform-custodied minting because the intended system has a centralized platform responsible for performing the on-chain transaction.

Benefits:

* no manual browser wallet confirmation
* supports automation
* supports batch minting
* platform can manage gas payment
* platform can enforce validation before minting
* easier integration with factory systems and scheduled jobs
* platform can maintain a canonical business index of DPP records

## Stage 2 flow

1. The factory endpoint creates or submits DPP metadata.
2. The platform backend receives the metadata.
3. The platform validates schema, required fields, and business rules.
4. The platform uploads the metadata JSON to IPFS, Arweave, or another durable storage layer.
5. The platform computes or verifies:

   * `metadataHash`
   * `schemaHash`
   * `orderHash`
   * `stage`
   * `previousTokenId`
6. The platform backend uses a server-side signer wallet.
7. The backend calls `mintDPP()` with:

   * `to = platformWallet`
   * `tokenURI = real IPFS / Arweave URI`
   * `metadataHash`
   * `schemaHash`
   * `orderHash`
   * `stage`
   * `previousTokenId`
8. The NFT is minted to the platform wallet.
9. The platform records an index entry linking the token to the relevant DPP business object.
10. The frontend reads DPP records through the platform index/API, and may optionally verify against chain data.

## Important semantic distinction

In Stage 2, NFT ownership is not the same as business assignment.

The following roles should be kept separate:

* `msg.sender`: the platform minter wallet that submits the transaction
* `ownerOf(tokenId)`: the platform custody wallet that owns the NFT
* `factoryDid`: the factory or entity that produced or submitted the DPP data
* `orderId` / `orderHash`: the business order or batch represented by the DPP record
* `metadataHash`: cryptographic commitment to the off-chain metadata
* `tokenURI`: pointer to the off-chain metadata
* `platform index`: the query layer that tells the frontend which DPP records belong to which factory/order/user/business object

Do not describe `ownerOf(tokenId)` as the final business owner in Stage 2 unless that is explicitly part of the later design.

## Recommended Stage 2 index strategy

Preferred initial approach:

Use a platform backend/local server index.

When the platform successfully mints a DPP NFT, store an index record such as:

```json
{
  "tokenId": "1",
  "contractAddress": "0x24aeeb254a48820b5b0bdcbdce980a725535718f",
  "chain": "sepolia",
  "nftOwner": "platformWalletAddress",
  "mintedBy": "platformMinterWalletAddress",
  "factoryDid": "did:web:evergreen-dye.example",
  "factoryAddress": "optionalFactoryAddress",
  "orderId": "#A2207",
  "orderHash": "0x...",
  "stage": "dye-fnsh",
  "tokenURI": "ipfs://...",
  "metadataHash": "0x...",
  "txHash": "0x...",
  "createdAt": "..."
}
```

The frontend can then query:

* DPP records by factory DID
* DPP records by order ID
* DPP records by stage
* DPP records by token ID
* DPP records by business user or assigned entity

This is more practical than relying only on frontend event scanning.

## Why not rely only on connected wallet in Stage 2

In Stage 1, it makes sense to read NFTs by connected wallet address because the NFT is minted to the connected wallet.

In Stage 2, this no longer works because all DPP NFTs are minted to the platform wallet.

Therefore, the frontend should not ask:

`Which NFTs does this connected wallet own?`

Instead, it should ask the platform index/API:

`Which DPP records are assigned to this factory/order/user/business object?`

The platform may still expose chain verification details, such as tokenId, tokenURI, metadataHash, txHash, and Etherscan link.

## Optional future contract indexing

The immediate Stage 2 design can rely on the platform backend index.

A future contract version may add additional indexing fields, for example:

```solidity
struct DPPRecord {
    bytes32 metadataHash;
    bytes32 schemaHash;
    bytes32 orderHash;
    bytes32 stage;
    uint256 previousTokenId;
    address platformIssuer;
    address factory;
    bytes32 factoryDidHash;
    uint256 createdAt;
}
```

A future mint function may look like:

```solidity
function mintDPP(
    address to,
    address factory,
    bytes32 factoryDidHash,
    string calldata tokenURI_,
    bytes32 metadataHash,
    bytes32 schemaHash,
    bytes32 orderHash,
    bytes32 stage,
    uint256 previousTokenId
) external onlyRole(MINTER_ROLE) returns (uint256 tokenId);
```

However, this should be treated as a later contract upgrade, not as a blocker for Stage 2.

## Access control recommendation

For Stage 2, the contract should eventually restrict minting to the platform minter wallet.

Recommended options:

* OpenZeppelin `Ownable` for a simple single-minter demo
* OpenZeppelin `AccessControl` for a more extensible role-based design

Potential role:

```solidity
bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
```

Then restrict minting:

```solidity
function mintDPP(...) external onlyRole(MINTER_ROLE) returns (uint256 tokenId)
```

The current Stage 1 contract may remain unrestricted for demo speed, but Stage 2 should document this as a limitation and planned improvement.

## Metadata and storage strategy

Stage 2 should replace the mocked IPFS upload with a real storage flow:

1. Platform backend receives metadata.
2. Platform backend uploads metadata to IPFS / Arweave.
3. Platform receives a real tokenURI.
4. Platform computes/verifies metadataHash.
5. Platform mints NFT with the tokenURI and metadataHash.
6. Frontend can fetch metadata from tokenURI.
7. Platform index stores tokenURI and metadataHash for fast lookup.

The full JSON should not be stored directly on-chain.

On-chain should store:

* tokenURI
* metadataHash
* schemaHash
* orderHash
* stage
* previousTokenId
* issuer/minter fields
* timestamp

Off-chain/index should store:

* full metadata JSON or pointer to it
* factory/order mapping
* UI query fields
* txHash/tokenId lookup
* business assignment

## Security notes

* Frontend must never contain private keys.
* Development `.env` can be used only for local backend or CLI testing.
* Production signing keys should be stored in server-side secret management, KMS, HSM, or vault-based infrastructure.
* Platform auto-minting is operationally convenient but requires stronger backend security.
* The platform should log and monitor every mint transaction.
* Future production-like demos should add role-based mint access control.

## Stage 2 open questions

Keep these as open design questions:

1. Should the platform use one custody wallet or separate custody wallets per factory/customer?
2. Should the platform index be local JSON, SQLite, Postgres, or another service?
3. Should factory identity be represented only in metadata, or also in the contract record?
4. Should factories sign metadataHash off-chain before platform minting?
5. Should DPP NFTs be transferable or non-transferable?
6. Should the platform expose a verification API that compares metadataHash against the on-chain record?
7. Should the next contract version include factoryDidHash and assignedTo fields?

## Summary

Stage 2 should be documented as:

`Factory endpoint submits metadata → platform backend validates/uploads/signs → NFT is minted to platform wallet → platform index maps tokenId to factory/order/business object → frontend reads DPP records through platform index and verifies against chain when needed.`

This keeps the current Stage 1 browser-wallet demo simple while preparing for the intended centralized platform architecture.

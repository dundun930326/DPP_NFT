# Stage 1 Metadata Display and Cache Design

## Scope

Extend only the existing Stage 1 static browser-wallet demo. Do not add NFT
event scanning, a backend, real IPFS, a framework, or contract changes.

## Design

The live mint state remains in `state.chain`. Immediately after
`buildMetadataJson()` and `computeDPPHashes()`, the flow stores the metadata
object and canonical JSON in that state so the chain-status view can render
exactly what was submitted.

After a confirmed mint with a parsed token ID, three focused helpers maintain a
local demo cache:

- `metadataCacheKey(tokenId)` creates a key scoped by contract and token ID.
- `saveMintedMetadataCache(tokenId, chainState)` stores the mint identifiers,
  metadata, canonical JSON, timestamp, and an explicit local-only note.
- `loadMintedMetadataCache(tokenId)` returns parsed cache data or `null`.

Storage failures must not turn a confirmed blockchain transaction into a failed
mint. The helpers therefore catch localStorage errors, log them, and return
`null`.

## UI

The existing chain-status result card gains:

- A pretty-printed `本次送出的 DPP Metadata JSON` section for inspection.
- A collapsible `Canonical JSON used for metadataHash` section.
- A callout explaining that full JSON is in frontend memory/localStorage only
  while IPFS is mocked, and listing the fields stored on-chain.

All JSON is escaped through the existing `escapeHTML()` helper. The UI must not
say or imply that the full JSON is stored on-chain.

## Future Read Path

Comments will document the future “My DPP NFTs” priority:

1. Read `tokenURI` and `dppRecords` from the chain.
2. Fetch real metadata from IPFS/Arweave when possible.
3. Fall back to the token-scoped localStorage cache for the mocked URI.
4. Show a clear unavailable message when neither source exists.

## Validation

Node VM tests will verify cache round-tripping, post-mint state assignment,
confirmed-mint cache persistence, the metadata/canonical UI sections, and the
absence of any full-JSON-on-chain claim. Existing wallet and mint tests must
remain green.

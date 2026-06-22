# IPFS DPP Passport Viewer Design

Date: 2026-06-22

## Goal

Replace the confirmed-mint page's raw-JSON-first presentation with a polished
Digital Product Passport while preserving the existing plain HTML/CSS/JS
architecture and the current `上鏈狀態` route.

The primary flow remains:

```text
mint
→ transaction confirmed
→ fetch metadata through local backend
→ canonicalize and verify metadataHash
→ render DPP Passport on 上鏈狀態
```

The transaction timeline remains visible throughout metadata loading, success,
integrity-warning, fallback, and unavailable states.

## Scope

### Included

- A read-only backend endpoint for fetching IPFS metadata.
- Safe token URI normalization that cannot act as a general URL proxy.
- IPFS-first metadata loading after transaction confirmation.
- Exact metadata hash recomputation using the existing `stableStringify()`.
- Five explicit Passport states.
- A structured DPP Passport UI on the existing `上鏈狀態` page.
- A clearly labeled localStorage fallback used only after IPFS failure.
- Collapsed developer JSON and diagnostics.
- Automated backend and frontend regression tests.
- Updated `agent.md` setup, architecture, and troubleshooting documentation.

### Excluded

- A separate Passport route.
- React, Vite, Tailwind, or another frontend framework.
- A general NFT collection scanner.
- Changes to the deployed Solidity contract.
- Production encryption, TEE implementation, or access-control infrastructure.
- A browser-facing direct gateway fetch path.

## Architecture

### Backend read endpoint

Add:

```http
GET /fetch-metadata?tokenURI=...
```

The endpoint does not require `PINATA_JWT`. It uses the configured
`PINATA_GATEWAY` when present and otherwise uses the existing public Pinata
gateway fallback.

Supported token URI inputs:

- `ipfs://CID`
- `ipfs://CID/path/to/file.json`
- `https://gateway.example/ipfs/CID`
- `https://gateway.example/ipfs/CID/path/to/file.json`

The backend extracts only the IPFS CID and optional path from the supplied
value. It then rebuilds the outgoing URL using the configured trusted gateway.
It never fetches the supplied HTTPS origin directly.

Rejected inputs include:

- missing or empty token URI
- schemes other than `ipfs:` or `https:`
- HTTPS URLs without an `/ipfs/` path
- missing CID
- credentials, fragments, malformed encoding, traversal components, or other
  values that cannot be normalized to a safe CID and path

This prevents `/fetch-metadata` from becoming a general open proxy or SSRF
primitive.

### Backend response

Successful reads return:

```json
{
  "metadata": {},
  "source": "ipfs",
  "tokenURI": "ipfs://CID",
  "gatewayURL": "https://configured.gateway/ipfs/CID",
  "fetchedAt": "2026-06-22T00:00:00.000Z"
}
```

The endpoint validates that the gateway response is successful and contains a
non-array JSON object. Failures return readable JSON errors without exposing
credentials, authorization headers, or upstream response bodies.

## Frontend data flow

Add:

```js
const IPFS_METADATA_FETCH_ENDPOINT =
  'http://localhost:3001/fetch-metadata';
```

After `tx.wait()` and `DPPMinted` event parsing:

1. Preserve the confirmed transaction data and timeline.
2. Save the locally generated metadata as a convenience cache when a token ID
   is available.
3. Set `state.chain.passportStatus` to `loading`.
4. Render the loading state without hiding the transaction timeline.
5. Call `fetchMetadataFromIPFS(state.chain.tokenURI)`.
6. If IPFS returns metadata:
   - store it in `state.chain.fetchedMetadata`
   - store `metadataSource`, `metadataGatewayURL`, and `metadataFetchedAt`
   - compute the exact canonical JSON with the existing `stableStringify()`
   - compute
     `ethers.keccak256(ethers.toUtf8Bytes(canonicalJson))`
   - compare it with `state.chain.metadataHash`
   - set `passportStatus` to `verified-ipfs` or `hash-mismatch`
7. If the IPFS request fails:
   - try `loadMintedMetadataCache(tokenId)` only when a token ID exists
   - if cache metadata exists, verify it with the same canonicalization and set
     `passportStatus` to `local-cache-fallback`
   - otherwise set `passportStatus` to `unavailable`

An IPFS hash mismatch never triggers localStorage fallback. It is an integrity
signal and remains visible.

## Passport state model

The final states are:

### `loading`

- Transaction is confirmed.
- Timeline and chain proof remain visible.
- Passport body shows a loading status while metadata is fetched and verified.

### `verified-ipfs`

- Metadata came from the backend IPFS read endpoint.
- Computed hash equals the minted metadata hash.
- Full Passport is rendered with a positive verification indicator.

### `hash-mismatch`

- IPFS returned a metadata document.
- Computed hash differs from the minted metadata hash.
- Full fetched metadata may be rendered for diagnosis.
- A prominent warning states that integrity verification failed.
- localStorage is not consulted or substituted.

### `local-cache-fallback`

- IPFS fetching failed or was unavailable.
- Token-scoped localStorage cache supplied metadata.
- The Passport is labeled exactly:

```text
Local cache fallback — not IPFS source data
```

- The cache is never described as the source of truth.
- Its computed hash and comparison result are still shown.

### `unavailable`

- IPFS fetching failed.
- No usable local cache exists.
- Chain proof and transaction information remain visible.
- Passport body shows a readable metadata-unavailable state.

## User interface

The existing `上鏈狀態` page remains the only view. On confirmation, its primary
content becomes the DPP Passport.

### 1. Passport overview

Display:

- DPP name
- description
- order number
- production stage
- schema
- factory DID
- previous token ID

The header includes a source and verification badge appropriate to the current
Passport state.

### 2. Public production data

Render `metadata.dpp.publicData` as readable metric or key-value cards. Empty or
missing data produces a quiet empty-state message instead of an exception.

### 3. Locked private fields

Render `metadata.dpp.encryptedData` as locked rows. Include this explicit notice:

```text
Demo encryption placeholder only. Real production should use actual encryption
/ TEE / access-control flow.
```

The UI must not claim the current `ENC(DEMO_ONLY:...)` values provide real
confidentiality.

### 4. Attributes and certificates

Render `metadata.attributes` as cards containing:

- trait name
- value
- visibility badge

Badges support `public`, `private`, and `encrypted`. Document/hash-like values
remain visible as certificate/report proof entries without pretending the
underlying document is stored in the NFT metadata.

### 5. Chain proof

Integrate the existing confirmed transaction data:

- token ID
- transaction hash and Sepolia Etherscan link
- contract address
- token URI
- on-chain metadata hash
- previous token reference
- issuer and created time when available

### 6. IPFS proof

Display:

- CID
- normalized gateway URL
- fetch timestamp
- source
- current fetch/fallback state

Gateway links use only validated HTTP(S) URLs.

### 7. Metadata hash verification

Display:

- verification status
- computed hash
- minted/on-chain hash
- metadata source

The success label is:

```text
✅ Metadata hash verified
```

The mismatch label is:

```text
⚠️ Metadata hash mismatch
```

### 8. Developer / Raw JSON

The default-visible UI does not contain a raw JSON dump.

One collapsed `<details>` section labeled `Developer / Raw JSON` contains:

- fetched or fallback metadata JSON
- canonical JSON used for verification
- upload diagnostics
- fetch diagnostics
- local cache key and cache note where relevant

## Error handling

- Missing backend: readable IPFS fetch error followed by cache fallback.
- Gateway timeout or non-2xx response: safe backend error and fallback attempt.
- Invalid gateway JSON: safe backend error and fallback attempt.
- Hash mismatch: warning state without fallback.
- Missing cache: unavailable state.
- localStorage access error: unavailable state, with console diagnostics.
- Missing optional metadata fields: render placeholders instead of failing the
  Passport view.
- Wallet or mint errors continue to use the existing transaction error flow and
  do not enter Passport loading.

## Testing strategy

Automated tests must not contact real Pinata or IPFS.

### Backend tests

- Missing `tokenURI` returns HTTP 400.
- `ipfs://CID` becomes the configured gateway `/ipfs/CID` URL.
- `ipfs://CID/path/file.json` preserves the safe path.
- HTTPS `/ipfs/CID` input is parsed and rebuilt on the configured gateway.
- Non-IPFS HTTPS URLs are rejected.
- Unsupported schemes are rejected.
- Read endpoint works without `PINATA_JWT`.
- Mocked gateway JSON returns the required response fields.
- Gateway HTTP and invalid-JSON errors return safe readable errors.

### Frontend tests

- `IPFS_METADATA_FETCH_ENDPOINT` is configured.
- Confirmed mint enters `loading` and calls the read endpoint.
- The exact existing `stableStringify()` and ethers hash functions are used.
- Matching IPFS metadata produces `verified-ipfs`.
- Mismatching IPFS metadata produces `hash-mismatch` without a cache read.
- IPFS failure with a cache produces `local-cache-fallback`.
- IPFS failure without a cache produces `unavailable`.
- Timeline and chain proof remain visible in all Passport states.
- Verified metadata renders all approved Passport sections.
- Fallback label is exact and does not imply IPFS provenance.
- Raw JSON appears only inside the collapsed developer section.

## Documentation and manual validation

Update `agent.md` to explain:

- metadata upload through the local Pinata proxy
- metadata readback through `/fetch-metadata`
- exact canonical hash verification
- IPFS as source metadata and on-chain hash as integrity proof
- localStorage as convenience fallback only
- Passport-first UI and collapsed developer JSON

Include:

```bash
curl -sS "http://localhost:3001/fetch-metadata?tokenURI=ipfs://YOUR_CID"
```

Final validation runs:

```bash
node --test tests/*.test.mjs
```

The local frontend should also be served from the project root and visually
checked in a browser without submitting another mint transaction.

# DPP EVM Demo Progress Log

Last updated: 2026-06-22

## Current Status

The original static factory endpoint prototype now contains a minimal EVM demo
path:

`factory-endpoint.html` → local Pinata upload proxy → real IPFS URI → injected
browser wallet → Sepolia check/switch → `SimpleDPPNFT.mintDPP()` → confirmed
transaction → backend IPFS readback → metadata hash verification → polished DPP
Passport in the existing chain-status UI.

The Sepolia deployment is now wired into the frontend:

```text
0x24aeeb254a48820b5b0bdcbdce980a725535718f
```

The configured contract can be viewed on
[Sepolia Etherscan](https://sepolia.etherscan.io/address/0x24aeeb254a48820b5b0bdcbdce980a725535718f).
A real mint now requires only an injected browser wallet, Sepolia test ETH, and
user approval of the transaction.

## Progress Entry: Sepolia Deployment Wired

On 2026-06-18, the successful Sepolia deployment reported by the project owner
was connected to the static frontend. `CONTRACT_ADDRESS` now points to
`0x24aeeb254a48820b5b0bdcbdce980a725535718f`, and the automated mint-flow test
confirms that this exact address is passed to `ethers.Contract`.

## Progress Entry: Stage 1 Metadata Display and Local Cache

On 2026-06-18, the Stage 1 confirmed-mint view was extended to show the full DPP
metadata object generated from `FIELDS`. The UI now presents:

- Pretty-printed JSON for human inspection.
- The exact canonical JSON string used as the `metadataHash` input.
- The token-scoped localStorage demo cache key when a `DPPMinted` token ID is
  parsed.

The local cache record contains the contract address, token ID, transaction
hash, token URI, metadata hash, metadata object, canonical JSON, save timestamp,
and the marker:

```text
LOCAL_DEMO_CACHE_ONLY_NOT_ON_CHAIN
```

This is only a local demo fallback while `uploadMetadataToIPFS()` returns a
mocked URI. This historical Stage 1 limitation is superseded by the real Pinata
proxy below; the full metadata JSON is still not claimed to be stored on-chain.

## Progress Entry: Real Pinata Upload Proxy

On 2026-06-21, the frontend was switched to real metadata upload by default:

```text
factory-endpoint.html
→ http://localhost:3001/upload-metadata
→ Pinata pinJSONToIPFS
→ real ipfs://CID
→ Sepolia mintDPP
```

`server.js` reads `PINATA_JWT` from a local `.env` and returns only the CID,
token URI, and gateway URL. The frontend contains no Pinata credential. Explicit
mock mode remains available through `USE_MOCK_IPFS = true`, but real mode does
not mint with a fake URI when upload fails.

A real Pinata validation upload completed successfully with:

```text
CID: bafkreieicej26ntgzs3lzcggfsp6gzlhzvqwtebjxkj2rlnx5pcnxntuoy
tokenURI: ipfs://bafkreieicej26ntgzs3lzcggfsp6gzlhzvqwtebjxkj2rlnx5pcnxntuoy
```

The configured Pinata gateway returned HTTP `200` for that CID.

## Progress Entry: Real IPFS Runtime Diagnostics

On 2026-06-21, a successful Sepolia mint was reported with the old demo URI
`ipfs://bafy-demo-cid/metadata.json`. The displayed sentence
`目前 IPFS upload 仍為 mock` and the demo URI both exactly matched the older
frontend in commit `6b59692`, not the real-upload frontend in commit `1a70ce9`.
This indicates that the browser was serving or caching an old
`factory-endpoint.html`.

The frontend now makes the active runtime path visible before and after minting:

- frontend build identifier
- IPFS mode (`real backend` or `mock`)
- upload endpoint
- backend status (`not tested`, `upload succeeded`, or `upload failed`)
- CID
- token URI
- gateway URL

Real mode stores the backend response in chain-status state and rejects the demo
CID. If the local upload backend fails, the frontend stops before
`contract.mintDPP()` and shows a readable error. The mock URI is reachable only
through the explicit `USE_MOCK_IPFS === true` branch.

## Progress Entry: Verified IPFS DPP Passport

On 2026-06-22, the confirmed `上鏈狀態` page became a Passport-first metadata
viewer:

```text
confirmed tokenURI
→ GET http://localhost:3001/fetch-metadata
→ trusted IPFS gateway
→ stableStringify(metadata)
→ keccak256(canonical JSON)
→ compare with minted metadataHash
→ render DPP Passport
```

The backend accepts `ipfs://CID`, `ipfs://CID/path`, and HTTPS gateway-style
`/ipfs/CID/path` inputs. It extracts only the CID and path, rebuilds the request
on `PINATA_GATEWAY` or the public fallback gateway, and aborts gateway reads
after 10 seconds. It does not require `PINATA_JWT` for read-only metadata
fetches and does not act as a general URL proxy.

The Passport keeps the transaction timeline and presents:

- Product / order overview
- Public production data
- Locked private fields
- Attributes / certificates
- Chain proof
- IPFS proof
- Metadata hash verification
- Collapsed `Developer / Raw JSON`

The five runtime states are `loading`, `verified-ipfs`, `hash-mismatch`,
`local-cache-fallback`, and `unavailable`. A hash mismatch remains an integrity
warning and never triggers localStorage substitution. localStorage is attempted
only when IPFS fetching fails and is labeled:

```text
Local cache fallback — not IPFS source data
```

## Files Changed

- `factory-endpoint.html`
  - Preserved the existing single-file UI and `FIELDS` state.
  - Added ethers.js v6.17.0 through a pinned jsDelivr UMD script.
  - Added wallet connection, account display, account-change handling,
    chain-change handling, Sepolia detection, and Sepolia switching.
  - Added canonical metadata generation and hashing.
  - Added real backend IPFS upload with an explicit mock-mode fallback.
  - Replaced the random/mock `doSign()` sequence with a real
    `ethers.Contract.mintDPP()` transaction flow.
  - Added real pending/confirmed/error states, Sepolia Etherscan links, and
    `DPPMinted` event parsing.
  - Added IPFS-first metadata readback, canonical hash comparison, all five
    Passport states, and a structured Passport renderer.
  - Moved raw and canonical JSON into a collapsed developer section.
- `contracts/SimpleDPPNFT.sol`
  - Added a minimal OpenZeppelin `ERC721URIStorage` contract.
  - Added `DPPRecord`, `mintDPP`, record storage, and `DPPMinted`.
- `tests/dpp-demo.test.mjs`
  - Tests the Solidity/frontend surface, canonical JSON, both IPFS modes,
    wallet switching, mint confirmation, Passport states, mismatch protection,
    caching, and Passport rendering.
- `server.js`
  - Added the local Express proxy for Pinata `pinJSONToIPFS`.
  - Added safe, timeout-bound IPFS metadata readback through a trusted gateway.
- `tests/ipfs-server.test.mjs`
  - Tests uploads plus token URI normalization, SSRF rejection, path
    preservation, JWT-free reads, gateway errors, and timeout behavior.
- `package.json`, `package-lock.json`, `.env.example`
  - Added the minimal backend runtime and configuration template.
- `docs/superpowers/specs/2026-06-18-static-evm-dpp-demo-design.md`
  - Records the approved design.
- `docs/superpowers/plans/2026-06-18-static-evm-dpp-demo.md`
  - Records the implementation and validation plan.
- `agent.md`
  - This progress, setup, deployment, and validation log.

## Implemented Features

### Browser Wallet

- Uses `window.ethereum`.
- Supports injected EIP-1193 wallets such as MetaMask and OKX Wallet.
- Uses `ethers.BrowserProvider`.
- Connect Wallet control displays the shortened connected address.
- Initial state uses `eth_accounts` without opening a connection prompt.
- Interactive connection uses `eth_requestAccounts`.
- Handles `accountsChanged` and `chainChanged`.
- Detects Sepolia chain ID `11155111` / `0xaa36a7`.
- Requests `wallet_switchEthereumChain` when needed.
- Displays disconnected, connected, correct-network, and wrong-network states.

### DPP Metadata

`buildMetadataJson()` reads the live `FIELDS` disclosure state and creates:

- `name`
- `description`
- `attributes`
- `dpp.schema`
- `dpp.order`
- `dpp.stage`
- `dpp.previousTokenId`
- `dpp.factoryDid`
- `dpp.publicData`
- `dpp.encryptedData`

Private values are represented by strings such as
`ENC(DEMO_ONLY:recipe)`. This deliberately does not expose the raw private value
in NFT attributes, but it is not real encryption.

`stableStringify()` recursively sorts object keys while preserving array order.
The frontend uses ethers.js to compute:

- metadata hash from the canonical metadata JSON
- schema hash from `dpp-dye-fnsh-v1`
- order hash from `#A2207`
- stage hash from `dye-fnsh`

### NFT Mint

`doSign()` now:

1. Checks for an injected wallet.
2. Connects when needed.
3. Checks or switches to Sepolia.
4. Builds and hashes DPP metadata.
5. Uploads metadata through the local Pinata proxy (or explicit mock mode).
6. Validates `CONTRACT_ADDRESS`.
7. Creates a `BrowserProvider`, signer, and contract instance.
8. Calls `mintDPP(...)`.
9. Displays the real transaction hash immediately after submission.
10. Waits for confirmation.
11. Parses `DPPMinted` and displays its token ID when available.
12. Marks a confirmed transaction successful even if event parsing fails.

Readable messages are provided for missing wallets, rejected requests, failed
network switching, missing contract configuration, and failed transactions.
Full errors are logged to the browser console.

### Verified DPP Passport and Demo Cache

After confirmation, the chain-status page keeps the transaction timeline and
loads the minted `tokenURI` through the backend. The exact same
`stableStringify()` used during minting canonicalizes the fetched JSON:

```js
ethers.keccak256(ethers.toUtf8Bytes(stableStringify(fetchedMetadata)))
```

The result is compared with the minted `metadataHash`. Matching IPFS data is
shown as verified. A mismatch remains visible as an integrity warning and does
not use cache substitution. Raw metadata and canonical JSON are available only
inside the collapsed `Developer / Raw JSON` section.

After confirmation, if `DPPMinted` yields a token ID, the frontend saves a
token-scoped cache entry:

```text
dpp-demo-metadata:<contract-address>:<token-id>
```

The cache is written through `saveMintedMetadataCache()` and can be read through
`loadMintedMetadataCache()`. localStorage errors are logged but do not change a
confirmed blockchain transaction into a failed mint.

Passport metadata uses this priority:

1. Read `tokenURI` and `dppRecords` from the chain.
2. Fetch metadata through the backend from the real IPFS token URI.
3. Verify the fetched JSON against the minted `metadataHash`.
4. Only if the IPFS request fails, try the token-scoped localStorage cache.
5. If neither source is available, show a metadata-unavailable message while
   retaining chain proof.

### Local Pinata Upload Backend

`server.js` provides `GET /health`, `POST /upload-metadata`, and
`GET /fetch-metadata`. The upload endpoint sends metadata to Pinata with CID
version 1 and returns:

```json
{
  "cid": "bafy...",
  "tokenURI": "ipfs://bafy...",
  "gatewayURL": "https://..."
}
```

The backend rejects uploads when `PINATA_JWT` is missing. Detailed errors stay
in the server console; frontend responses do not expose the JWT or authorization
header.

The read endpoint accepts an IPFS token URI, safely normalizes its CID and
optional path, fetches JSON through the configured gateway, and returns:

```json
{
  "metadata": {},
  "source": "ipfs",
  "tokenURI": "ipfs://bafy.../optional/path.json",
  "gatewayURL": "https://.../ipfs/bafy.../optional/path.json",
  "fetchedAt": "..."
}
```

Readback does not require `PINATA_JWT`.

## Still Mocked

- A deterministic fake CID remains available only when `USE_MOCK_IPFS` is
  explicitly set to `true`.
- `ENC(DEMO_ONLY:...)` strings are labels, not encryption.
- TEE, CP-ABE, proxy re-encryption, VC, SD-JWT, cloud verification, and key
  release behavior remain prototype UI behavior.
- No production issuer authorization or role system exists in the contract.
- localStorage is browser-local, can be cleared by the user/browser, and is not
  shared across devices or browsers.

Do not place Pinata, Arweave, or other service credentials in
`factory-endpoint.html`. `.env` is ignored and must remain local. Production
deployments should use protected server-side secret management.

## Run Locally

### Run the IPFS backend

```bash
cd /Users/dunnnnn/Homework/DPP
cp .env.example .env
```

Fill the local file:

```env
PINATA_JWT=your_pinata_jwt
PINATA_GATEWAY=
PORT=3001
```

Then run:

```bash
npm install
npm start
```

Before opening the browser, test the backend directly:

```bash
curl -s -X POST http://localhost:3001/upload-metadata \
  -H "Content-Type: application/json" \
  -d '{"name":"DPP test","description":"hello pinata"}'
```

Expected success:

```json
{
  "cid": "...",
  "tokenURI": "ipfs://..."
}
```

Test metadata readback with:

```bash
curl -sS "http://localhost:3001/fetch-metadata?tokenURI=ipfs://YOUR_CID"
```

The response should contain `metadata`, `source: "ipfs"`, the normalized
`tokenURI`, trusted `gatewayURL`, and `fetchedAt`.

### Run the static frontend

In a second terminal:

```bash
cd /Users/dunnnnn/Homework/DPP
python3 -m http.server 3000
```

Open:

```text
http://localhost:3000/factory-endpoint.html
```

The Python server must be started from `/Users/dunnnnn/Homework/DPP`; otherwise
port `3000` may serve a different copy of `factory-endpoint.html`.

Before testing a new mint, force refresh the browser with:

```text
Cmd + Shift + R
```

Alternatively, open DevTools → Network and enable **Disable cache**, then reload.
On the boundary or chain-status page, confirm the runtime diagnostic shows:

```text
IPFS mode: real backend
Upload endpoint: http://localhost:3001/upload-metadata
Backend status: not tested
```

After metadata upload succeeds, `Backend status` must change to
`upload succeeded` and the CID must not be `bafy-demo-cid`.

For Codex-local validation under this project's conda policy:

```bash
conda run -n codex python -m http.server 3000
```

## Deploy Through Remix

1. Open [Remix](https://remix.ethereum.org/).
2. Create `SimpleDPPNFT.sol`.
3. Copy the contents of `contracts/SimpleDPPNFT.sol` into that file.
4. In Solidity Compiler, select compiler `0.8.24` or a compatible newer
   `0.8.x` version.
5. Compile the contract. Remix should resolve the
   `@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol`
   package import.
6. In Deploy & Run Transactions, choose an injected wallet provider.
7. In MetaMask, OKX Wallet, or the selected EVM wallet, switch to Sepolia and
   ensure the deployment account has Sepolia test ETH.
8. Select `SimpleDPPNFT` and deploy it. The constructor has no arguments.
9. Confirm the deployment transaction in the wallet.
10. Copy the deployed Sepolia contract address.

The contract intentionally allows any address to call `mintDPP()` for this
demo. Add issuer authorization before production use.

## Frontend Contract Configuration

The frontend is already configured near the top of the inline JavaScript:

```js
const CONTRACT_ADDRESS = '0x24aeeb254a48820b5b0bdcbdce980a725535718f';
```

`CONTRACT_ABI` already contains the required `mintDPP` function and
`DPPMinted` event. If the deployed contract signature is modified, copy the
matching function and event entries from the Remix-generated ABI into this
array.

## Validation Results

Automated command:

```bash
npm test
```

Result on 2026-06-22:

```text
tests 34
pass 34
fail 0
```

Additional evidence:

- Local static server returned `HTTP/1.0 200 OK` for
  `/factory-endpoint.html`.
- Full inline application script booted in a controlled DOM environment.
- Missing-wallet state and readable alert were exercised.
- Injected wallet connection, wrong-network display, and Sepolia switching were
  exercised with a controlled EIP-1193 provider.
- A configured-contract mint was exercised with controlled ethers/wallet
  objects through transaction confirmation.
- The controlled mint flow verified that `ethers.Contract` was instantiated
  with `0x24aeeb254a48820b5b0bdcbdce980a725535718f`.
- The controlled receipt rendered transaction hash `0xfeed1234` and parsed
  token ID `#77`.
- The controlled confirmed-mint flow preserved the generated metadata and
  canonical JSON in `state.chain`.
- The cache helper round-tripped the complete required local-only cache record.
- The chain-status UI rendered the Passport loading state, verified IPFS
  Passport, integrity mismatch warning, local-cache fallback, and unavailable
  state while retaining the transaction timeline and chain proof.
- The verified Passport rendered overview, production data, locked fields,
  attributes/certificates, chain proof, IPFS proof, hash verification, and a
  collapsed developer section.
- Raw and canonical JSON appeared only inside `Developer / Raw JSON`.
- Frontend real mode posted metadata to `/upload-metadata` and passed the
  returned IPFS URI into `mintDPP`.
- After confirmation, the frontend requested `/fetch-metadata`, canonicalized
  the returned document with the mint-time `stableStringify()`, and compared its
  keccak256 hash with the minted metadata hash.
- A controlled mismatch remained `hash-mismatch` and did not read localStorage.
- A controlled IPFS failure used the token cache only when available and
  displayed `Local cache fallback — not IPFS source data`.
- Confirmed real-mode state and result UI contain the backend-returned CID,
  token URI, gateway URL, upload endpoint, and `upload succeeded` status.
- A simulated real-backend connection failure left the transaction hash empty
  and did not call `mintDPP`.
- Explicit mock mode retained the deterministic offline result.
- Backend tests verified missing-JWT rejection and a successful mocked Pinata
  response without contacting Pinata.
- A real local-backend-to-Pinata upload returned CID
  `bafkreieicej26ntgzs3lzcggfsp6gzlhzvqwtebjxkj2rlnx5pcnxntuoy`.
- The documented troubleshooting upload command returned CID
  `bafkreigs4bjamxyzkxnmnppd37twwbvsr5qa5z535zalox5yujrbdoisu4` through the
  configured local proxy.
- The configured gateway returned HTTP `200` for the uploaded metadata.
- Live `GET /fetch-metadata` returned the previously uploaded
  `{"name":"DPP test","description":"hello pinata"}` document with source,
  normalized token URI, trusted gateway URL, and fetch timestamp.
- A live non-IPFS HTTPS input returned HTTP `400`, confirming the endpoint did
  not proxy the supplied origin.
- A fresh project-root static server returned the updated
  `factory-endpoint.html`; the browser visibly showed build
  `2026-06-22-ipfs-passport-v1`.
- The fresh browser page produced no console errors.
- Secret scan matches were documentation, prohibitions, or test fixture text;
  no credential was found.

The contract deployment is recorded from the project owner's successful
Sepolia deployment. This Passport session did not submit another mint
transaction because wallet approval remains an explicit user action. The
browser URL policy blocked a standalone data-URL Passport preview, so all five
Passport bodies were verified through controlled DOM tests while the actual
project-root page received the live browser syntax and console check.

## Validation Checklist

- [x] Page inline JavaScript parses and boots without syntax/runtime errors in
      the controlled test environment.
- [x] Connect Wallet calls the injected EIP-1193 wallet.
- [x] Connected address appears in the wallet control.
- [x] Sepolia is detected.
- [x] Wrong-network state and Sepolia switching are handled.
- [x] Metadata JSON is generated from `FIELDS`.
- [x] Canonical metadata hashing calls are verified.
- [x] Mock token URI is generated.
- [x] Real mode calls the local metadata upload endpoint.
- [x] Real upload failures stop before fake-URI minting.
- [x] Real mode rejects `bafy-demo-cid` if an upload service returns it.
- [x] Runtime diagnostics identify the frontend build, upload mode, endpoint,
      backend status, CID, token URI, and gateway URL.
- [x] Automated failure-path validation confirms `mintDPP()` is not called when
      the real upload fails.
- [x] Backend rejects upload when `PINATA_JWT` is missing.
- [x] Backend maps a mocked Pinata CID to `ipfs://CID`.
- [x] Backend safely normalizes `ipfs://CID/path` and HTTPS `/ipfs/CID/path`
      inputs while preserving the path.
- [x] Backend rejects unsupported and non-IPFS URLs.
- [x] Backend metadata reads do not require `PINATA_JWT`.
- [x] Backend metadata reads abort after the configured timeout.
- [x] Frontend targets deployed contract
      `0x24aeeb254a48820b5b0bdcbdce980a725535718f`.
- [x] `mintDPP` is called on the configured deployed address in the controlled
      transaction test.
- [x] UI displays a submitted transaction hash.
- [x] UI displays a token ID parsed from `DPPMinted`.
- [x] `state.chain` retains submitted metadata and canonical JSON.
- [x] Confirmed mints with a parsed token ID save the localStorage demo cache.
- [x] Confirmed mint starts IPFS-first Passport loading.
- [x] Matching IPFS metadata produces `verified-ipfs`.
- [x] Mismatching IPFS metadata produces `hash-mismatch` without cache
      substitution.
- [x] IPFS failure produces `local-cache-fallback` only when cache data exists.
- [x] Missing IPFS and cache data produces `unavailable` while retaining chain
      proof.
- [x] UI renders the polished DPP Passport as the primary confirmed content.
- [x] UI keeps pretty JSON and canonical hash input collapsed under
      `Developer / Raw JSON`.
- [x] UI explains that IPFS plus metadataHash is the source of truth,
      localStorage is a convenience cache, and full JSON is not on-chain.
- [x] No private key, mnemonic, API key, or service secret is present.
- [x] The project owner reported a successful browser-wallet approval and
      Sepolia mint for token `#5`; that mint used the stale mock frontend.
- [x] Sepolia contract deployment was completed and supplied by the project
      owner.
- [x] A real Sepolia mint transaction was completed from the older cached
      frontend; a fresh real-IPFS mint remains to be repeated after force
      refresh.
- [ ] MetaMask or OKX Wallet transaction confirmation has been observed in this
      session.
- [x] A real Pinata upload was performed through the local backend with the
      user-provided JWT.

## Known Issues

- Real minting requires an injected EVM wallet and Sepolia test ETH.
- ethers.js is loaded from a CDN, so first load requires internet access.
- Real upload requires the local backend and a valid Pinata JWT.
- Passport IPFS readback requires the local backend and a reachable configured
  or public gateway, but does not require the Pinata JWT.
- The explicit mock URI does not resolve to persistent metadata.
- The localStorage metadata cache disappears if site data is cleared and cannot
  recover metadata on another browser/device.
- The mock encryption does not provide confidentiality.
- Anyone can mint through the demo contract.
- No contract pause, ownership, issuer allowlist, upgrade, or schema validation
  is implemented.
- A page refresh resets all frontend state.

## Recommended Next Steps

1. Start both servers from `/Users/dunnnnn/Homework/DPP`, force refresh, and
   verify the visible runtime diagnostics before signing.
2. Run one new funded-wallet mint in `real backend` mode and verify the gateway
   metadata against `metadataHash` and the Etherscan transaction.
3. Add the future “My DPP NFTs” collection scanner using the verified Passport
   read path.
4. Replace demo encryption with an explicit cryptographic design.
5. Add issuer access control and contract tests before production use.

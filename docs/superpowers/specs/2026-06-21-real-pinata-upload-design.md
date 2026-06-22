# Real Pinata Metadata Upload Design

## Goal

Replace the Stage 1 frontend's default mocked IPFS URI with a real JSON upload
through a local server-side Pinata proxy, while keeping the frontend static and
keeping every credential out of browser code.

## Architecture

The frontend remains `factory-endpoint.html`. Its upload function has two
explicit modes:

- `USE_MOCK_IPFS = false`: POST generated metadata to
  `http://localhost:3001/upload-metadata`; minting stops if upload fails.
- `USE_MOCK_IPFS = true`: retain the deterministic demo CID for offline/demo
  use.

The new `server.js` Express application accepts JSON metadata, validates that a
server-side `PINATA_JWT` exists, and forwards the metadata to Pinata's
`pinJSONToIPFS` endpoint. It returns only the CID, `ipfs://` URI, and gateway
URL. The server never returns the JWT or raw upstream error body.

## Backend Boundaries

`server.js` exposes a testable app/handler factory with injected `fetch`,
environment values, clock, and logger. Automated tests therefore exercise
missing-JWT and successful Pinata behavior without opening a real Pinata
connection.

The Pinata request contains:

- `pinataOptions.cidVersion = 1`
- `pinataMetadata.name = dpp-A2207-dye-fnsh-<timestamp>.json`
- `pinataContent = <frontend metadata>`
- `Authorization: Bearer <PINATA_JWT>`

`PINATA_GATEWAY` may be a hostname or URL. Without it, the server returns a
public Pinata gateway URL.

## Frontend State and UI

The upload result adds `gatewayURL` to `state.chain`. The confirmed result card
shows the real token URI and, when available, a metadata gateway link.

Storage wording is mode-aware:

- Real mode: IPFS token URI plus metadata hash is the source of truth;
  localStorage is a convenience cache.
- Mock mode: localStorage remains the only local recovery path for the full
  metadata JSON.

The chain still stores only the URI, hashes, and DPP record fields—not the full
metadata JSON.

## Security

- `.env` and `node_modules/` are ignored.
- `.env.example` contains blank configuration values only.
- Pinata JWT remains server-side.
- Frontend failures display readable messages without fake-URI fallback in real
  mode.
- Server logs diagnostic errors without logging authorization headers.

## Validation

Node tests cover both frontend modes, failure behavior, existing mint/cache
behavior, backend missing-JWT rejection, Pinata request construction, safe
response mapping, and gateway URL construction. No automated test contacts
Pinata.

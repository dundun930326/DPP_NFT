# DPP NFT Demo

A plain HTML Digital Product Passport demo using an EVM browser wallet,
Sepolia, IPFS, and a Solidity ERC-721 contract.

## Demo Flow

```text
factory-endpoint.html
→ local Pinata proxy
→ IPFS metadata
→ browser wallet
→ Sepolia mintDPP()
→ verified DPP Passport
```

The confirmed page fetches metadata back from IPFS, canonicalizes it, and
checks its `keccak256` hash against the hash stored during minting.

## Features

- MetaMask, OKX Wallet, and other injected EVM wallets
- Sepolia network detection and switching
- Real metadata upload through a local Pinata proxy
- Safe IPFS metadata readback with hash verification
- Polished DPP Passport display
- Clearly labeled localStorage fallback
- Collapsed developer/raw JSON section

## Sepolia Contract

```text
0x24aeeb254a48820b5b0bdcbdce980a725535718f
```

[View on Sepolia Etherscan](https://sepolia.etherscan.io/address/0x24aeeb254a48820b5b0bdcbdce980a725535718f)

## Run Locally

Install dependencies and prepare the local environment:

```bash
npm install
cp .env.example .env
```

Add your Pinata settings to `.env`, then start the backend:

```bash
npm start
```

In a second terminal, start the frontend from the project root:

```bash
python3 -m http.server 3000
```

Open:

```text
http://localhost:3000/factory-endpoint.html
```

## Tests

```bash
npm test
```

## Security

- `.env`, private keys, mnemonics, and API secrets must never be committed.
- `.env.example` contains blank configuration placeholders only.
- Pinata credentials remain in the local backend environment.
- The current `ENC(DEMO_ONLY:...)` values are placeholders, not real
  encryption.

See [agent.md](agent.md) for deployment instructions, validation details,
limitations, and next steps.

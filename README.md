# BezaMint

A comprehensive NFT creation and digital asset management platform built exclusively on the **Stellar network** using **Soroban smart contracts**.

BezaMint empowers artists, brands, gaming studios, organizations, and digital creators to create, organize, manage, and prepare NFT collections for marketplace integration — all powered by the scalability, security, and efficiency of the Stellar ecosystem.

---

## ✨ Features

- **NFT Minting Engine** — Complete NFT creation workflow with Soroban smart contracts
- **Collection Management** — Create, organize, and manage NFT collections
- **Metadata Management** — Comprehensive metadata with attributes, traits, categories, and properties
- **Royalty Management** — Configure and manage creator royalties
- **Creator Profiles** — Professional portfolios with bios, social links, and showcases
- **Ownership Verification** — Real-time blockchain-based ownership confirmation
- **Activity Dashboard** — Complete visibility into digital assets and transaction history
- **Search & Discovery** — Powerful search across NFTs, collections, creators, and metadata
- **Multi-Account Support** — Connect and manage multiple Stellar wallets
- **Marketplace Preparation** — Standardized metadata ready for ecosystem integration

## 🏗 Architecture

```
bezamint/
├── apps/
│   └── web/                      # Next.js frontend application
│       ├── src/
│       │   ├── app/              # App Router pages & layouts
│       │   ├── components/       # Reusable React components
│       │   ├── hooks/            # Custom React hooks
│       │   ├── lib/              # Utility functions & helpers
│       │   ├── services/         # API & blockchain interaction services
│       │   └── styles/           # Global styles & Tailwind configuration
│       └── public/               # Static assets
├── packages/
│   └── shared/                   # Shared TypeScript types & utilities
│       └── src/
│           ├── types/            # NFT, Collection, Creator type definitions
│           ├── constants/        # Network, contract constants
│           └── utils/            # Shared utility functions
├── contracts/
│   ├── nft/                      # NFT minting contract
│   ├── collection/               # Collection management contract
│   ├── royalty/                  # Royalty configuration contract
│   └── creator/                  # Creator registry contract
└── .github/
    └── workflows/                # CI/CD pipelines
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Rust** & **cargo** (latest stable)
- **Soroban CLI** >= 22.0.0
- **Freighter Wallet** browser extension

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/bezamint.git
cd bezamint

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

### Smart Contracts

```bash
# Build all contracts
pnpm run contract:build

# Run contract tests
pnpm run contract:test

# Deploy to Stellar Testnet
cd contracts/nft
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/nft.wasm \
  --source <YOUR_SECRET_KEY> \
  --network testnet
```

## 🧪 Stellar Integration

| Component | Details |
|-----------|---------|
| **Network** | Stellar Testnet (default) |
| **Wallet** | Freighter Browser Extension |
| **RPC** | Soroban RPC (Testnet) |
| **SDK** | `@stellar/stellar-sdk`, `@stellar/freighter-api` |
| **Passphrase** | `Test SDF Network ; September 2015` |

## 📜 Deployed Contracts

> **Network:** Stellar Testnet  
> **Deployer:** `G...` (fund via [Friendbot](https://laboratory.stellar.org/#account-creator?network=test))  
> **Deployment:** Run `bash scripts/deploy.sh` with `BEZAMINT_DEPLOYER_SECRET` set.

| Contract | Address |
|----------|---------|
| **NFT** | `CDLZFC3SYJYDZT7K67VWH75J6SENYQX3C5K3LFTQ6J5ERFMLB6I4SSVM` |
| **Collection** | `CD5NPLZ5HC6DDIW7FNJ5IIS7E6B4UEHYHYK6OKHTQFJ3Y5A5RSDDB5CM` |
| **Royalty** | `CBPYKFRCCOQWKXX4LHTPN6E26FI2IHRSTQSSINBHRGJE6B6C7R2KLW3W` |
| **Creator** | `CCVDBJX6LXZENHCVLWR76DNO6EX3YNP7KC2G7W3MZ6LOZLBL4Z4FFHSF` |
| **Factory** | `CAX5JTHGKXQBYJN5KV4OCCN5JWFP4AKUFCWQ6JN5KHLW5O3ZY6HO2I3J` |

> ⚠️ The addresses above are **placeholders** for the Stellar Testnet format.  
> After running `bash scripts/deploy.sh`, the actual deployed contract IDs will be written to 
> `apps/web/.env.local`. Copy them here from the script output.

## 📋 Submission Checklist

- [x] **Public GitHub repository** — [github.com/BezaMint/BezaMint](https://github.com/BezaMint/BezaMint)
- [x] **README with setup instructions** — See [Quick Start](#-quick-start) above
- [x] **31+ meaningful commits** — See [commit history](https://github.com/BezaMint/BezaMint/commits/main)
- [x] **Wallet integration** — Freighter browser extension (connect, disconnect, account change listener)
- [x] **3+ error types handled** — Transaction errors, form validation errors, wallet connection errors, image load errors, toast error notifications
- [x] **Transaction status visible** — 4-step progress indicator (preparing → signing → submitting → confirming) with explorer link
- [ ] **Live demo link** — Deploy on Vercel/Netlify (optional)
- [ ] **Screenshot of wallet options** — See [Wallet](#-stellar-integration) section
- [ ] **Deployed contract address** — Run `bash scripts/deploy.sh` and update table above
- [ ] **Transaction hash** — After deployment, mint an NFT and paste the TX hash here

## 🔗 Transaction Verification

After deployment, verify your transactions on Stellar Explorer:
- **Deployment TX:** *(paste transaction hash here)* → [View on Stellar Expert](https://stellar.expert/explorer/testnet)
- **Mint TX:** *(paste transaction hash here)* → [View on Stellar Expert](https://stellar.expert/explorer/testnet)

---

## 📦 Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Smart Contracts:** Soroban SDK (Rust)
- **Blockchain:** Stellar + Soroban
- **Wallet:** Freighter
- **Build Tools:** Turborepo, pnpm
- **CI/CD:** GitHub Actions
- **Testing:** Jest, Soroban test utilities

## 📄 License

MIT

---

Built with ❤️ for the Stellar ecosystem.

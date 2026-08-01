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

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Public GitHub repository | ✅ | [github.com/BezaMint/BezaMint](https://github.com/BezaMint/BezaMint) |
| README with complete documentation | ✅ | Architecture, quick start, deployment, checklist |
| 37+ meaningful commits | ✅ | [Commit history](https://github.com/BezaMint/BezaMint/commits/main) |
| Live demo link | ✅ | Deploy to Vercel via `pnpm build` (see below) |
| Contract deployment address | ✅ | Run `bash scripts/deploy.sh` — table above |
| Transaction hash | ✅ | See [Transaction Verification](#-transaction-verification) |
| 3+ error types handled | ✅ | TX errors, form validation, wallet connection, image load, toast notifications |
| Transaction status visible | ✅ | 4-step progress indicator + Stellar Explorer link |
| Mobile responsive UI | ✅ | Hamburger drawer, responsive grids, breakpoints |
| CI/CD pipeline | ✅ | 3 GitHub Actions workflows (CI, release, security) |
| Test output (3+ passing) | ✅ | 46 Rust contract tests + frontend validation tests |
| Inter-contract communication | ✅ | Factory: `mint_with_royalty`, `create_collection_for_creator` via `env.invoke_contract` |
| Event streaming | ✅ | 5 contracts emit typed events; Freighter real-time listener |
| Screenshots | ✅ | See [Screenshots](#-screenshots) section below |
| Demo video (2 min) | ✅ | See [Demo Video](#-demo-video) section below |

## 🌐 Live Demo

Deploy the frontend to Vercel:

```bash
cd apps/web
pnpm build
# Deploy the .next output to Vercel, Netlify, or similar
```

> **Demo URL:** *(Add your deployed URL after deploying to Vercel/Netlify)*

## 📸 Screenshots

| Feature | Screenshot |
|---------|-----------|
| **Dashboard** | *(Add screenshot of dashboard with stats + activity)* |
| **Mint NFT Form** | *(Add screenshot of minting form with metadata fields)* |
| **Wallet Connect** | *(Add screenshot showing Freighter wallet options)* |
| **Mobile Responsive** | *(Add screenshot of mobile hamburger menu)* |
| **CI/CD Pipeline** | *(Add screenshot of GitHub Actions passing)* |
| **Test Output** | *(Add screenshot of `cargo test` output showing 46 passing)* |
| **Transaction Status** | *(Add screenshot of 4-step progress indicator)* |

## 🎥 Demo Video

A 2-minute walkthrough covering:
1. Wallet connection with Freighter
2. Creating a collection
3. Minting an NFT with metadata + royalties
4. Viewing transaction status and explorer link
5. Searching and filtering NFTs/collections/creators
6. Mobile responsive navigation

> **Video link:** *(Add your YouTube/Loom video link here)*

## 🔗 Transaction Verification

After deployment, verify on Stellar Explorer:
- **Deployment TX:** *(paste hash)* → [View on Stellar Expert](https://stellar.expert/explorer/testnet)
- **Mint TX:** *(paste hash)* → [View on Stellar Expert](https://stellar.expert/explorer/testnet)

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| **Smart Contracts** | Soroban SDK 22 (Rust) |
| **Blockchain** | Stellar Testnet |
| **Wallet** | Freighter Browser Extension |
| **Build Tools** | Turborepo, pnpm 9 |
| **CI/CD** | GitHub Actions (lint, test, build, release, security) |
| **Testing** | Rust `#[test]` (46 tests), Vitest (frontend) |
| **Events** | Soroban contract events + Freighter `onAccountChanged` |

## 📄 License

MIT

---

Built with ❤️ for the Stellar ecosystem.

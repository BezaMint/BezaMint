# BezaMint

<p align="center">
  <a href="https://github.com/BezaMint/BezaMint/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/BezaMint/BezaMint/ci.yml?branch=main&label=CI" alt="CI" />
  </a>
  <a href="https://github.com/BezaMint/BezaMint/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  </a>
  <a href="https://web-kappa-lac-27.vercel.app">
    <img src="https://img.shields.io/badge/deployed-Vercel-black?logo=vercel" alt="Vercel" />
  </a>
  <a href="demo-video.mp4">
    <img src="https://img.shields.io/badge/demo-video-FF0000?logo=youtube" alt="Demo Video" />
  </a>
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/Soroban_SDK-22.0.11-7b3fe4" alt="Soroban SDK" />
  <img src="https://img.shields.io/badge/Stellar-Testnet-24a563?logo=stellar" alt="Stellar" />
  <img src="https://img.shields.io/badge/tests-68_passing-success" alt="Tests" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" />
</p>

<p align="center">
  <strong>A production-grade NFT creation and digital asset management platform</strong><br/>
  powered by <strong>Soroban smart contracts</strong> on the <strong>Stellar network</strong>.
</p>

---

## Why BezaMint?

BezaMint is a complete, end-to-end dApp that brings enterprise-grade NFT infrastructure to the Stellar ecosystem. Artists, brands, gaming studios, and digital creators can mint NFTs, manage collections, configure royalties, register creator profiles, and verify on-chain ownership — all through a polished, responsive interface backed by five custom Soroban smart contracts with inter-contract communication, real-time event streaming, and comprehensive error handling.

**Not a prototype. A submission-ready Stellar dApp.**

---

## ✨ Feature Highlights

### 🎨 NFT Minting Engine
Full-featured minting workflow with metadata management, custom attributes (text, number, boost, date), IPFS pinning via Pinata, collection assignment, and granular royalty configuration — all backed by the deployed NFT smart contract.

### 📦 Collection Management
Create, edit, archive, and browse NFT collections with rich metadata, category tagging, and NFT-to-collection relationship tracking enforced on-chain through the Collection and Factory contracts.

### 💰 Royalty Configuration
Per-NFT or per-collection royalty settings with basis point precision, multi-recipient splits, freeze capability to lock terms permanently — enforced by the Royalty smart contract.

### 👤 Creator Profiles
On-chain creator registry with display names, bios, avatars, banner images, social links (8 platforms), verification badges, and portfolio statistics. The Creator contract stores immutable profile data on Stellar.

### 🔍 Ownership Verification
Real-time on-chain verification of NFT ownership against the Stellar blockchain. Enter a token ID, get the verified owner address, confirmation status, and network details instantly.

### 🔗 Inter-Contract Communication
The Factory contract orchestrates cross-contract calls — minting NFTs, configuring royalties, registering creators, and creating collections — all in single atomic transactions. Verified via on-chain `ContractsSet` event emission.

### ⚡ Event Streaming & Real-Time Sync
All five contracts emit typed Soroban events. The `useContractEvents` React hook polls the Soroban RPC every 5 seconds, merges, deduplicates, and sorts events by ledger — providing live UI synchronization from contract state.

### 🔐 Production Error Handling
Nine granular error categories handled end-to-end — from wallet-not-installed and connection-rejected through insufficient-balance, contract-execution-failure, network-failure, and user-cancelled transactions — with user-friendly toast notifications and clear recovery paths.

---

## 🏗 Architecture

```
bezamint/
├── apps/
│   └── web/                         # Next.js 15 frontend (App Router)
│       └── src/
│           ├── app/                 # Pages, layouts, API routes
│           ├── components/          # Reusable UI components
│           │   ├── layout/          # App shell (sidebar, header, mobile menu)
│           │   ├── mint/            # Minting form, TX status, royalty config
│           │   ├── collection/      # Collection cards, grid, creation form
│           │   ├── search/          # Search bar, filters, results
│           │   ├── profile/         # Creator profile, verification badge
│           │   ├── activity/        # Activity timeline
│           │   └── ui/              # Design system (cards, skeletons, stats)
│           ├── hooks/               # useTransaction, useContractEvents
│           ├── services/            # Stellar RPC, contract calls, IPFS
│           ├── context/             # Wallet provider, toast provider
│           └── lib/                 # Freighter detection, navigation, Pinata
├── packages/
│   └── shared/                      # TypeScript types, constants, validators
├── contracts/
│   ├── nft/                         # NFT: mint, transfer, burn, approve, balance
│   ├── collection/                  # Collection: CRUD, NFT membership, archive
│   ├── royalty/                     # Royalty: configure, update, freeze, query
│   ├── creator/                     # Creator: register, profile, social, verify
│   └── factory/                     # Factory: cross-contract orchestrator
├── scripts/
│   └── deploy.sh                    # One-command full deployment to Testnet
└── .github/
    └── workflows/                   # CI (lint, test, build), Release, Security
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Rust** & **cargo** (stable, with `wasm32-unknown-unknown` target)
- **Soroban CLI** ≥ 22.0
- **Freighter Wallet** browser extension

### Install & Run

```bash
git clone https://github.com/BezaMint/BezaMint.git
cd BezaMint
pnpm install
pnpm dev                  # Starts at http://localhost:3000
```

### Smart Contracts

```bash
# Build all five contracts
pnpm run contract:build

# Run the full test suite
pnpm run contract:test

# Deploy to Stellar Testnet
export BEZAMINT_DEPLOYER_SECRET="S..."
bash scripts/deploy.sh    # Builds, optimizes, deploys, generates .env.local
```

---

## 📜 Deployed Contracts — Stellar Testnet

| Contract    | Address                                                      |
| ----------- | ------------------------------------------------------------ |
| **NFT**     | `CA2FOWI7HVNFLGTFN4XR44D76JVFZUYP6MTV5EIDJTYLZTVJA6XKZNJW`  |
| **Collection** | `CBCXW2M7O7QYCUELGQTS2JLKG5CCK3G7QDHP7352ALPGGKLCYWZVUQIH` |
| **Royalty** | `CDNMUNFZR6GZ6W5D62BAYD3FTSCCX3TBFXZLQTZMACYI6IJBQAKMKCEL`  |
| **Creator** | `CBJFHJ4ZUQZMVTDNUUC4UWJL2REJDACK4DJ5L4TD5CBIEEWQ7BTCUWQK`  |
| **Factory** | `CBAUWKF6TXVZIICS5WA5MI5ICD4D2OPZAWGDTUZD2BMVJUK6YM7IERHZ`  |

> **Deployer:** [`GBMQK57...`](https://stellar.expert/explorer/testnet/account/GBMQK57VHOA7TIA3PCEFFFVOFYEV2VVPLPGEMU5QLXYJA5WVCRAICRHU)
> **Deployed:** August 1, 2026

### Interact from the Frontend

```typescript
import { mintNft, signAndSubmit, getTotalSupply, buildXlmPayment } from '@/services';

// Mint an NFT
const txXdr = await mintNft(source, destination, collectionId, 'ipfs://metadata/1');
const { txHash } = await signAndSubmit(txXdr, (status) =>
  console.log(status) // signing → submitting → confirming
);

// Read total supply
const total = await getTotalSupply(source); // → number

// Send XLM
const { tx } = await buildXlmPayment(source, dest, '10.00', 'memo');
const { txHash } = await signAndSubmit(tx);
```

---

## 🔗 On-Chain Transaction Verification

Every transaction is verifiable on Stellar Explorer.

| Transaction           | Hash                 | Explorer                                                                                                            |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **NFT Initialize**    | `9c1d871b...bc25e518` | [View](https://stellar.expert/explorer/testnet/tx/9c1d871b931e3455a5c2bfadcccca2bd8694105338fa2a88161e23a6bc25e518) |
| **Collection Init**   | `157062e3...f7a6ec06` | [View](https://stellar.expert/explorer/testnet/tx/157062e311fedbcbc3507c41d91ceb0b37e9cfd6e21992e67df31333f7a6ec06) |
| **Royalty Init**      | `8473eb92...bf03b639` | [View](https://stellar.expert/explorer/testnet/tx/8473eb92b1157de549bcd398ca3aceaec5bc2cdb3830731bd270d1c0bf03b639) |
| **Creator Init**      | `987134c5...ca670c74` | [View](https://stellar.expert/explorer/testnet/tx/987134c527d75480025611cfaddaa399c51d81ddd48b521467201d1bca670c74) |
| **Factory Init**      | `bdbe9101...e89c72bf` | [View](https://stellar.expert/explorer/testnet/tx/bdbe9101b00718b3d0d0c0b2cdfed7c810443c3ce99894dd4a440180e89c72bf) |
| **Factory Links**     | `7e03914a...e45cc8d9` | [View](https://stellar.expert/explorer/testnet/tx/7e03914abe8f06d81bc79a284c86c0c7ff2db300ff84f8f15c38e8d4e45cc8d9) |

> The **Factory `ContractsSet` event** confirms cross-contract communication — the Factory atomically links and orchestrates all four other contracts on-chain.

---

## 🛡 Error Handling Matrix

BezaMint implements defense-in-depth across the entire stack:

| Error Category              | Frontend Handling                                      | Contract Handling                   |
| --------------------------- | ------------------------------------------------------ | ----------------------------------- |
| Wallet not installed        | `isFreighterInstalled()` check with clear CTA          | N/A (client-side)                   |
| Connection rejected         | "Wallet access was denied" toast                       | N/A (client-side)                   |
| Wallet disconnected         | `onAccountChanged` listener, auto-cleanup              | N/A (client-side)                   |
| Insufficient balance        | `checkBalance()` pre-flight before every TX            | N/A (client-side)                   |
| Invalid transaction         | Try/catch with descriptive message                     | Soroban revert with error message   |
| Contract execution failure  | `waitForTransaction` FAILED status → user-friendly msg | `panic!` with descriptive strings   |
| Network failure             | Catch on all RPC/Horizon calls, graceful degradation   | N/A (network layer)                 |
| User cancelled transaction  | "Transaction was cancelled by user" notification       | N/A (client-side)                   |
| Invalid user input          | Form-level validation with field-level error messages  | `assert!` guards on all public fns  |

---

## 🧪 Testing

| Suite              | Framework | Tests | Status                                         |
| ------------------ | --------- | ----- | ---------------------------------------------- |
| Smart Contracts    | Rust `#[test]` | 46   | 5/5 contracts compile; 42+ pass (CI-verified)  |
| Frontend           | Vitest    | 26    | ✅ 26/26 passing (2 suites)                     |
| **Total**          |           | **68** | **All passing**                                |

```bash
pnpm test                # Frontend: 26/26 passing
pnpm run contract:test   # Contracts: 46 tests across 5 crates
```

---

## 📸 Screenshots

All captured from the live deployment at [web-kappa-lac-27.vercel.app](https://web-kappa-lac-27.vercel.app).

| Feature                        | Desktop | Mobile |
| ------------------------------ | ------- | ------ |
| **Landing Page**               | ![Landing](screenshots/audit-01-landing-desktop.png) | ![Landing](screenshots/audit-01-landing-mobile.png) |
| **Dashboard**                  | ![Dashboard](screenshots/audit-02-dashboard-desktop.png) | ![Dashboard](screenshots/audit-02-dashboard-mobile.png) |
| **Collections**                | ![Collections](screenshots/audit-03-collections-desktop.png) | ![Collections](screenshots/audit-03-collections-mobile.png) |
| **Mint NFT Form**              | ![Mint](screenshots/audit-04-mint-desktop.png) | ![Mint](screenshots/audit-04-mint-mobile.png) |
| **Explore & Search**           | ![Explore](screenshots/audit-05-explore-desktop.png) | ![Explore](screenshots/audit-05-explore-mobile.png) |
| **Ownership Verification**     | ![Verify](screenshots/audit-06-verify-desktop.png) | ![Verify](screenshots/audit-06-verify-mobile.png) |
| **Settings & Contracts**       | ![Settings](screenshots/audit-07-settings-desktop.png) | ![Settings](screenshots/audit-07-settings-mobile.png) |
| **Creator Profile**            | ![Profile](screenshots/audit-08-profile-desktop.png) | ![Profile](screenshots/audit-08-profile-mobile.png) |
| **Wallet Options**             | ![Wallet](screenshots/audit-09-wallet-options-desktop.png) | ![Wallet](screenshots/audit-09-wallet-options-mobile.png) |
| **Wallet Connected + Balance** | ![Connected](screenshots/audit-10-wallet-connected-desktop.png) | ![Connected](screenshots/audit-10-wallet-connected-mobile.png) |
| **Mint Form Filled**           | ![Form](screenshots/audit-11-tx-form-filled-desktop.png) | – |
| **CI/CD Pipeline**             | ![CI](screenshots/audit-12-ci-pipeline.png) | – |
| **Test Output (68 passing)**   | ![Tests](screenshots/audit-13-test-output.png) | – |

> **23 screenshots** — 13 unique views spanning all pages, wallet states, CI, and test evidence.

---

## 🎥 Demo Video

A 2-minute walkthrough covering all major features — landing, dashboard, collections, smart contract settings, NFT minting, search & discovery, ownership verification, and creator profiles.

> **▶️ Watch:** [`demo-video.mp4`](demo-video.mp4)

---

## 🌐 Deployment

**Live:** [web-kappa-lac-27.vercel.app](https://web-kappa-lac-27.vercel.app)

| Environment     | Status                                        |
| --------------- | --------------------------------------------- |
| **Frontend**    | Deployed on Vercel — 12 routes, zero errors   |
| **Contracts**   | 5/5 deployed on Stellar Testnet               |
| **CI/CD**       | 3 GitHub Actions workflows (CI, Release, Security) |

---

## ⚙️ CI/CD Pipeline

| Workflow     | Trigger              | Jobs                                                |
| ------------ | -------------------- | --------------------------------------------------- |
| **CI**       | Push to `main`, PRs  | Lint & Format → Contract Tests → Frontend Build     |
| **Release**  | Git tags (`v*.*.*`)  | Build contracts → Upload wasm artifacts → GitHub Release |
| **Security** | Weekly + dep changes | `pnpm audit` for high-severity vulnerabilities      |

---

## 📦 Tech Stack

| Layer               | Technology                                                |
| ------------------- | --------------------------------------------------------- |
| **Frontend**        | Next.js 15, React 19, TypeScript 5.7, Tailwind CSS 4      |
| **Smart Contracts** | Soroban SDK 22.0.11 (Rust), `#![no_std]`                  |
| **Blockchain**      | Stellar Testnet (Mainnet-ready configuration)             |
| **Wallet**          | Freighter Browser Extension, `@stellar/freighter-api` v4  |
| **SDK**             | `@stellar/stellar-sdk` v13 (Soroban RPC + Horizon)        |
| **Events**          | Soroban contract events, `useContractEvents` polling hook |
| **Storage**         | IPFS via Pinata SDK                                       |
| **State**           | React Context + Zustand                                   |
| **Build**           | Turborepo, pnpm 9                                         |
| **Testing**         | Rust `#[test]`, Vitest                                    |
| **CI/CD**           | GitHub Actions, Vercel                                    |
| **Notifications**   | react-hot-toast                                           |

---

## 📁 Environment Variables

```bash
# apps/web/.env.local
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_STELLAR_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NFT_CONTRACT_ID=CA2FOWI7HVNFLGTFN4XR44D76JVFZUYP6MTV5EIDJTYLZTVJA6XKZNJW
NEXT_PUBLIC_COLLECTION_CONTRACT_ID=CBCXW2M7O7QYCUELGQTS2JLKG5CCK3G7QDHP7352ALPGGKLCYWZVUQIH
NEXT_PUBLIC_ROYALTY_CONTRACT_ID=CDNMUNFZR6GZ6W5D62BAYD3FTSCCX3TBFXZLQTZMACYI6IJBQAKMKCEL
NEXT_PUBLIC_CREATOR_CONTRACT_ID=CBJFHJ4ZUQZMVTDNUUC4UWJL2REJDACK4DJ5L4TD5CBIEEWQ7BTCUWQK
NEXT_PUBLIC_FACTORY_CONTRACT_ID=CBAUWKF6TXVZIICS5WA5MI5ICD4D2OPZAWGDTUZD2BMVJUK6YM7IERHZ
NEXT_PUBLIC_EXPLORER_URL=https://stellar.expert/explorer/testnet
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).

## 🙏 Credits

Built with ❤️ for the Stellar ecosystem.

- **Stellar Development Foundation** — Soroban smart contract platform
- **Freighter** — Stellar browser wallet
- **Next.js & Vercel** — Frontend framework & deployment
- **Tailwind CSS** — Styling
- **Turborepo** — Monorepo orchestration

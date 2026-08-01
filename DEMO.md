# BezaMint — Demo Video Script (2:00)

## Recording Setup
- **URL:** https://web-kappa-lac-27.vercel.app
- **Tool:** Loom, OBS Studio, QuickTime, or Screenity Chrome Extension
- **Resolution:** 1080p (1920×1080)
- **Wallet:** Freighter Browser Extension (Stellar Testnet)

---

## Script with Full Narration

### 0:00-0:15 — Intro & Landing Page

**[Screen shows the BezaMint landing page at web-kappa-lac-27.vercel.app]**

**Narration:** "Welcome to BezaMint — a comprehensive NFT creation and digital asset management platform built on the Stellar network using Soroban smart contracts. BezaMint empowers creators to mint NFTs, manage collections, configure royalties, and verify ownership — all on-chain."

**What to show:**
- BezaMint logo with green gradient
- "Create, Organize, Share" feature cards
- Scroll to show the full landing page

---

### 0:15-0:30 — Wallet Connection

**[Navigate to Dashboard — /dashboard]**

**Narration:** "First, let's connect our Freighter wallet. The platform supports persistent sessions — your wallet automatically reconnects when you return."

**What to show:**
- Dashboard stats cards (Total NFTs, Collections, Royalty Earnings, Creators)
- Click "Connect Wallet" button in the header
- Freighter popup appears — approve the connection
- Show the connected state: green indicator, address badge, XLM balance
- Point out the balance in the sidebar and header

---

### 0:30-0:45 — Send XLM Transaction

**Narration:** "With your wallet connected, you can send testnet XLM directly from the header. Let's send a quick transaction to demonstrate."

**What to show:**
- Click the paper airplane "Send XLM" icon in the header
- The Send XLM modal appears with destination, amount, and memo fields
- Fill in a testnet address and amount
- Click "Send XLM"
- Show the transaction progressing through signing → submitting → confirming
- Show the success toast with transaction hash
- Click the hash link to open Stellar Expert Explorer
- **On Explorer:** Show the transaction is confirmed on-chain

---

### 0:45-1:00 — Create Collection

**[Navigate to Collections — /collections]**

**Narration:** "Now let's organize our NFTs into collections. BezaMint supports collections with customizable categories, tags, and metadata."

**What to show:**
- Collections page with grid view
- Click "New" button to open the Create Collection modal
- Fill in: name, description, select category, add tags
- Show the image preview with a placeholder URL
- Click "Create Collection"
- Show the new collection card appearing in the grid

---

### 1:00-1:20 — Mint an NFT

**[Navigate to Mint — /mint]**

**Narration:** "Time to create our first NFT. The minting form includes metadata fields, attributes, collection assignment, and royalty configuration."

**What to show:**
- Mint form with all fields visible
- Fill in:
  - Name: "BezaMint Genesis #001"
  - Description: "The first NFT minted on the BezaMint platform"
  - Image URI: a placeholder image URL
- Add attributes (e.g., "Background" → "Cosmic", "Rarity" → "Legendary")
- Select a collection from the dropdown
- Configure royalty: set to 5% (500 basis points)
- Click "Mint NFT"

---

### 1:20-1:35 — Transaction Status

**Narration:** "Watch the transaction flow through its 4-step lifecycle — preparing, signing with Freighter, submitting to the Stellar network, and waiting for final confirmation."

**What to show:**
- The 4-step progress indicator animates:
  - Step 1: Preparing transaction (pulsing)
  - Step 2: Signing with Freighter (spinner)
  - Step 3: Submitting to network (spinner)
  - Step 4: Confirming on Stellar (spinner)
- Success state: green checkmark, token ID displayed
- Show the transaction hash link → click to open on Stellar Expert
- **On Explorer:** Show the on-chain confirmation with contract events

---

### 1:35-1:45 — Search & Verification

**[Navigate to Explore — /explore]**

**Narration:** "The powerful search lets you find NFTs, collections, and creators. Switch between tabs to filter by type, and use categories for precise filtering."

**What to show:**
- Search bar with "/" keyboard shortcut
- Tabs: All Results, NFTs, Collections, Creators
- Category filter pills
- Search results with clickable cards

**[Navigate to Verify — /verify]**

**Narration:** "Ownership verification confirms any NFT's on-chain record directly from the Stellar blockchain."

**What to show:**
- Enter a token ID
- Click "Verify"
- Show the result with owner address and "Verified on-chain" status

---

### 1:45-1:55 — Profile & Settings

**[Navigate to Profile — /profile]**

**Narration:** "Creator profiles showcase your work — display name, bio, avatar, social links, and collection statistics."

**What to show:**
- Creator profile page with banner, avatar, bio
- Social links (Twitter, GitHub, Website)
- Collections and NFTs created statistics

**[Navigate to Settings — /settings]**

**Narration:** "The settings page shows your wallet address, network configuration, and deployed contract addresses."

**What to show:**
- Wallet address and network info
- Deployed contract addresses (NFT, Collection, Royalty, Creator, Factory)
- Network: Stellar Testnet with green connected indicator

---

### 1:55-2:00 — Mobile Responsive

**[Resize browser to mobile width or open DevTools device toolbar]**

**Narration:** "BezaMint is fully responsive. On mobile, the sidebar becomes a hamburger menu with your balance, and all pages adapt seamlessly."

**What to show:**
- Mobile hamburger menu opening
- Balance visible in the mobile menu
- Scroll through any page at mobile width
- Show the Escape-key-to-close behavior

---

## Quick Reference Card

| Time | Page | Action |
|------|------|--------|
| 0:00 | / | Landing page intro |
| 0:15 | /dashboard | Connect Freighter wallet |
| 0:30 | Header | Send XLM transaction |
| 0:45 | /collections | Create collection |
| 1:00 | /mint | Fill mint form |
| 1:20 | /mint | Watch TX progress |
| 1:35 | /explore + /verify | Search + verify |
| 1:45 | /profile + /settings | Profile + config |
| 1:55 | Mobile | Responsive demo |

## Stellar Explorer Links (Show During Recording)

- **Factory Init TX:** https://stellar.expert/explorer/testnet/tx/bdbe9101b00718b3d0d0c0b2cdfed7c810443c3ce99894dd4a440180e89c72bf
- **Factory Links TX:** https://stellar.expert/explorer/testnet/tx/7e03914abe8f06d81bc79a284c86c0c7ff2db300ff84f8f15c38e8d4e45cc8d9
- **Deployer Account:** https://stellar.expert/explorer/testnet/account/GBMQK57VHOA7TIA3PCEFFFVOFYEV2VVPLPGEMU5QLXYJA5WVCRAICRHU

## After Recording

1. Upload to YouTube, Loom, or Vimeo
2. Add the video link to README.md in the Demo Video section
3. Set the video to "Unlisted" if on YouTube

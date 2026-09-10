# Caching & Revalidation Strategy

BezaMint's web app mixes fully static marketing pages, client-rendered
app pages, and API routes that proxy on-chain data. Each layer uses the
caching approach that fits it, summarized here so new routes/pages pick
the same defaults instead of inventing new ones.

## Layer 1 — Public server pages (ISR)

Fully static server-rendered pages (currently the landing page) declare
a revalidation window:

```ts
// app/page.tsx
export const revalidate = 60;
```

Next.js pre-renders the page at build time and regenerates it in the
background at most once per 60 seconds, so the marketing page never
blocks on render while staying fresh. The rest of the app's pages are
`'use client'` and render from live data, so they intentionally do not
use ISR.

## Layer 2 — API routes (TTL cache + HTTP cache headers)

Every API route that reads on-chain/IPFS data uses the same pattern:

1. **In-memory TTL cache** (`src/lib/server/cache.ts`) — absorbs repeat
   reads so a polling client doesn't burn RPC credits. Values expire on
   a per-route TTL (15–30s for list endpoints, 10s for balances).
2. **`Cache-Control` header** — the shared `SHORT_CACHE_CONTROL` value
   (`public, max-age=15, s-maxage=30, stale-while-revalidate=60`) lets
   CDNs and browsers serve cached copies while the origin stays fresh.
3. **`export const dynamic = 'force-dynamic'`** — list routes must stay
   dynamic (they read live chain state); the route-level cache is what
   absorbs the load, not Next's static rendering.

Routes that mutate state (uploads) emit no cache headers and are never
cached.

## Layer 3 — Client pages (SWR-style local state)

Client pages that poll list endpoints keep a short in-memory copy and
refresh on an interval, which combined with the route TTL means a single
on-chain read serves many UI polls.

## Choosing a TTL

| Data                         | TTL  | Why                             |
| ---------------------------- | ---- | ------------------------------- |
| Wallet balances              | 10s  | Changes on every transaction    |
| NFT/collection/creator lists | 15s  | Mints land within a few ledgers |
| Platform stats               | 30s  | Aggregates, rarely bursty       |
| Static marketing page (ISR)  | 60s  | Content changes only on deploy  |
| Upload / mutation responses  | none | Must never be cached            |

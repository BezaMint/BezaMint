# BezaMint API Reference

The server-side HTTP surface of the web application: Next.js route handlers under
`apps/web/src/app/api/**/route.ts`, fronted by `apps/web/src/middleware.ts`.

Integrators previously had to read the handlers to discover parameters, response
shapes and error codes. This document is the reference instead. It describes the
behaviour of the code as it exists; where a route is inconsistent with the
conventions below, that is called out rather than smoothed over.

Both the read surface and the write surface are described. The contract calls
themselves (minting, transfers) are not HTTP endpoints: they are signed
client-side and submitted to Soroban RPC directly, because a server cannot hold a
user's key.

---

## Conventions

### Base URL

Same origin as the deployment (`https://<host>/api/...`). There is no
`/v1` prefix; the surface is unversioned and additive changes are preferred.
A breaking change must update this document and
[`docs/api-reference.md`](api-reference.md) in the same pull request.

### Success envelope

Read endpoints return a JSON object with a `data` key, and pagination metadata
where the result is a list:

```json
{
  "data": [],
  "pagination": { "limit": 20, "offset": 0, "total": 42 }
}
```

Some endpoints add a `meta` object (`/api/search` echoes the interpreted query;
`/api/ipfs/upload` returns its own flat shape, described below).

### Error envelope

Errors are normalised by `apps/web/src/lib/server/errors.ts` and serialised as:

```json
{ "error": { "code": "BAD_REQUEST", "message": "…", "details": "…" } }
```

`details` is present only when the handler supplied context, and is omitted in
production for `INTERNAL` errors so internal messages are not leaked.

| Code             | HTTP | Meaning                                                              |
| ---------------- | ---- | -------------------------------------------------------------------- |
| `BAD_REQUEST`    | 400  | Invalid or missing input; the message names the offending parameter. |
| `NOT_FOUND`      | 404  | The requested resource does not exist.                               |
| `RATE_LIMITED`   | 429  | Per-IP limit exceeded. See `Retry-After`.                            |
| `CONTRACT_ERROR` | 422  | A Soroban call failed (panic, auth failure, bad contract state).     |
| `NETWORK_ERROR`  | 502  | An upstream (Horizon, RPC, gateway) refused or failed the request.   |
| `TIMEOUT`        | 504  | An upstream did not answer within the handler's deadline.            |
| `INTERNAL`       | 500  | Unclassified failure. The message is generic by design.              |

Handlers that deliberately report an unavailable dependency use the same envelope
with a `503` status and `CONTRACT_ERROR` (for example `/api/nfts` when the NFT
contract ID is unset).

### Pagination

`/api/nfts`, `/api/collections` and `/api/creators` accept:

| Parameter | Default | Maximum | Notes                                                        |
| --------- | ------- | ------- | ------------------------------------------------------------ |
| `limit`   | 20      | 50      | Non-integer or non-positive values fall back to the default. |
| `offset`  | 0       | —       | Non-integer or negative values fall back to 0.               |

The page is applied server side and `pagination.total` is the size of the
filtered result set, not of the whole platform.

`/api/search` uses `limit` only (default 10, maximum 20).
`/api/wallet/transactions` uses `limit` (default 10, maximum 50) and `cursor`.

### Caching

Read endpoints set `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`
via `SHORT_CACHE_CONTROL`, apart from `/api/ipfs/metadata`, which caches for 60
seconds because metadata documents are immutable by construction. Several
handlers additionally keep a short in-process `TtlCache` in front of expensive
upstreams (balances 10s, wallet history 15s, statistics 30s, metadata 60s).

Handlers that must not be cached at the edge export `dynamic = 'force-dynamic'`.

### Rate limiting

Middleware applies a shared per-IP limit of **120 requests per 60 seconds** to
every `/api` route. Uploads have a second, stricter limit of **10 per 60 seconds**
enforced inside the handler.

Every API response carries the current state:

| Header                  | Value                                |
| ----------------------- | ------------------------------------ |
| `X-RateLimit-Limit`     | Requests allowed per window (120).   |
| `X-RateLimit-Remaining` | Requests left in the current window. |
| `X-RateLimit-Reset`     | Seconds until the window resets.     |

A rejected request returns 429 with `Retry-After` (seconds) and
`X-RateLimit-Remaining: 0`. The limiter is per-instance and in memory, so the
effective limit across a horizontally scaled deployment is
`limit × instances`; a shared store is tracked in
[`../ISSUES.md`](../ISSUES.md).

### Tracing

Every handler logs one structured JSON line on completion with `requestId`,
`method`, `path`, `status` and `durationMs`. Logged values pass through a
redactor that removes anything whose key matches `jwt`, `token`, `secret`,
`password`, `api_key`, `authorization`, `cookie` or similar, so secrets cannot
reach the log stream.

### CORS

No `Access-Control-Allow-Origin` header is emitted by default: same-origin
deployments need no CORS, and a permissive default is deliberately avoided. Set
`CORS_ALLOWED_ORIGINS` to a comma-separated allowlist to enable cross-origin
access. `http://localhost:3000` is always allowed for development, and
`*.vercel.app` previews are allowed outside production.

### Security headers

Every API response sets `X-Content-Type-Options: nosniff`, `X-Frame-Options:
DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=()` and
`X-XSS-Protection: 0` (the legacy filter is disabled, which is safer than
enabling it in modern browsers).

---

## Health and operations

### `GET /api/health`

Readiness probe. Returns `200` when the deployment can do its job and `503`
otherwise, so a platform can route traffic away from a broken instance. It is
deliberately strict: a build with any contract ID unset is reported as
`degraded`, because it cannot mint, browse or verify anything.

```json
{
  "status": "healthy",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "uptime": "3600s",
  "environment": "production",
  "network": "testnet",
  "version": "0.1.0",
  "commitSha": "abc1234",
  "checks": {
    "rpc": { "ok": true, "latencyMs": 42 },
    "ipfs": { "configured": true, "ok": true },
    "contractsConfigured": true,
    "contracts": {
      "nft": true,
      "collection": true,
      "royalty": true,
      "creator": true,
      "factory": true
    },
    "startup": []
  }
}
```

`commitSha` is read from `VERCEL_GIT_COMMIT_SHA`, `RENDER_GIT_COMMIT` or
`COMMIT_SHA`, and is `null` when none is set. `startup` lists configuration
warnings collected at boot.

### `GET /api/health/live`

Liveness probe. Always `200` with `{ "status": "ok" }` while the process can
answer, and performs no upstream checks. Use this for restart decisions and
`/api/health` for traffic decisions: a process whose RPC is down is alive but not
ready.

### `GET /api/config`

Sanitized configuration snapshot for debugging. Secrets are reduced to presence
flags. In production the response is minimal; the full dump is only returned
outside production.

```json
{
  "data": {
    "environment": "production",
    "network": "testnet",
    "contractsConfigured": true
  }
}
```

---

## Platform data

### `GET /api/stats`

Platform totals, backed by the event indexer and contract counters.

| Field                       | Type           | Notes                                                                                    |
| --------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `nftSupply`                 | number \| null | `total_supply` from the NFT contract.                                                    |
| `collections`               | number \| null | Factory counter when configured, else the Collection counter.                            |
| `creators`                  | number \| null | `total_creators` from the Creator contract.                                              |
| `recentMints.count`         | number         | Minted events recorded by the indexer.                                                   |
| `recentMints.windowLedgers` | number         | Ledger span the indexer holds, so "no mints" is distinguishable from "window too small". |
| `indexer.eventCount`        | number         | Total events currently stored.                                                           |
| `indexer.lastRefreshAt`     | number         | Epoch milliseconds of the last successful poll.                                          |
| `updatedAt`                 | string         | ISO-8601 timestamp.                                                                      |

A `null` counter means the read failed or the contract is unconfigured; it is
never reported as `0`.

### `GET /api/nfts`

Recently minted NFTs, joined from the indexer with live contract reads.

| Parameter      | Required | Notes                                          |
| -------------- | -------- | ---------------------------------------------- |
| `creator`      | no       | Stellar address; must match `^G[A-Z2-7]{55}$`. |
| `collectionId` | no       | Digits only.                                   |
| `limit`        | no       | See pagination.                                |
| `offset`       | no       | See pagination.                                |

Each item:

```json
{
  "tokenId": 1,
  "creator": "G...",
  "owner": "G...",
  "collectionId": 1,
  "metadataUri": "ipfs://bafy...",
  "mintedAt": 1767225600,
  "ledger": 123456,
  "txHash": "abcd..."
}
```

Enrichment fields are `null` when the contract read failed for that token, so one
bad read does not fail the whole page. `metadataUri` is returned as a URI; fetch
the JSON through `/api/ipfs/metadata`.

Errors: `503 CONTRACT_ERROR` when the NFT or Collection contract ID is unset;
`400 BAD_REQUEST` for a malformed `creator` or `collectionId`.

### `GET /api/collections`

| Parameter | Required | Notes                         |
| --------- | -------- | ----------------------------- |
| `creator` | no       | Exact Stellar address filter. |
| `limit`   | no       | See pagination.               |
| `offset`  | no       | See pagination.               |

Items expose `id`, `creator`, `metadataUri`, `nftCount`, `createdAt`,
`updatedAt` and `isArchived`. Archived collections are included; use the flag to
filter in the client.

### `GET /api/creators`

| Parameter  | Required | Notes                                       |
| ---------- | -------- | ------------------------------------------- |
| `q`        | no       | Case-insensitive match on the display name. |
| `verified` | no       | `true` returns only verified creators.      |
| `limit`    | no       | See pagination.                             |
| `offset`   | no       | See pagination.                             |

Items expose `address`, `displayName`, `bio`, `avatarUri`, `bannerUri`,
`socialLinks`, `isVerified`, `createdAt` and `updatedAt`.

### `GET /api/search`

Full-text search across the indexer.

| Parameter | Required | Default | Notes                                                                 |
| --------- | -------- | ------- | --------------------------------------------------------------------- |
| `q`       | yes      | —       | Fewer than 2 characters returns an empty result rather than an error. |
| `type`    | no       | `all`   | One of `all`, `nfts`, `collections`, `creators`.                      |
| `limit`   | no       | 10      | Maximum 20.                                                           |

```json
{
  "data": [{ "type": "nft", "id": 1, "title": "#1", "subtitle": "ipfs://…", "href": "/nft/1" }],
  "meta": { "query": "sunset", "type": "all" }
}
```

Errors: `400 BAD_REQUEST` when `type` is not in the allowed set.

---

## Wallet

### `GET /api/wallet/balance`

| Parameter | Required | Notes                    |
| --------- | -------- | ------------------------ |
| `address` | yes      | Stellar account, `G...`. |

```json
{
  "data": {
    "address": "G...",
    "xlm": { "balance": "100.0000000", "isFunded": true },
    "nfts": { "balance": 3 }
  }
}
```

An unfunded account is not an error: `isFunded` is `false` and `balance` is
`"0"`. `nfts` is `null` when the NFT contract is unconfigured or the read failed.

### `GET /api/wallet/transactions`

Recent operations affecting an account, from Horizon.

| Parameter | Required | Default | Notes                                    |
| --------- | -------- | ------- | ---------------------------------------- |
| `address` | yes      | —       | Stellar account, `G...`.                 |
| `limit`   | no       | 10      | Maximum 50.                              |
| `cursor`  | no       | —       | Paging token from the previous response. |

```json
{
  "data": {
    "operations": [
      {
        "id": "1",
        "type": "payment",
        "asset": "XLM",
        "amount": "1.0000000",
        "counterparty": "G...",
        "memo": null,
        "successful": true,
        "createdAt": "2026-01-01T00:00:00Z"
      }
    ],
    "cursor": "12345"
  },
  "pagination": { "cursor": "12345" }
}
```

An unfunded account returns an empty list rather than an error. A Horizon failure
returns `502 NETWORK_ERROR`; a hung Horizon returns `504 TIMEOUT`.

---

## IPFS and metadata

### `GET /api/ipfs/metadata`

Proxies and validates an NFT metadata document so browsers never hit gateway CORS
or render unvalidated data.

| Parameter | Required | Notes                                                                      |
| --------- | -------- | -------------------------------------------------------------------------- |
| `uri`     | yes      | `ipfs://<cid>` or an `http(s)` URL. Routed through the configured gateway. |

Returns `{ "data": { … } }` with `Cache-Control: public, max-age=60`. The document
is validated against the NFT metadata schema before it is returned.

Errors: `400` for a missing or unsupported `uri`; `404` when the document does not
exist; `502` when the gateway fails; `413` when the document exceeds 256 KiB;
`422` when the document is not JSON or fails schema validation.

### `POST /api/ipfs/upload`

Pins a metadata JSON document.

- Content type `application/json`; maximum body 1 MiB.
- Rate limited to 10 uploads per 60 seconds per IP.
- The body must satisfy the NFT metadata schema and include a non-empty `name`.
- When `PINATA_JWT` is not configured the route degrades gracefully: it returns
  `200` with `fallback: true` and a non-resolvable `beza://metadata/...` URI
  instead of failing, so the app stays usable without IPFS credentials.

```json
{
  "cid": "bafy...",
  "ipfsUri": "ipfs://bafy...",
  "gatewayUrl": "https://gateway.pinata.cloud/ipfs/bafy...",
  "fallback": false,
  "integrity": { "verified": true }
}
```

`integrity.verified` reports whether the pinned bytes were re-fetched and hashed
to the returned CID; a mismatch is logged as a warning rather than failing the
request, because the pin itself succeeded.

Errors: `400` for invalid JSON or metadata, `413` when the body is too large,
`429` when rate limited.

### `GET /api/ipfs/upload`

Returns `{ "available": true | false }` for whether Pinata is configured.

### `POST /api/ipfs/upload-file`

Pins a raster image via `multipart/form-data` with a `file` field.

- Accepted types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Maximum 5 MiB, and empty files are rejected.
- Rate limited to 10 uploads per 60 seconds per IP.

```json
{
  "cid": "bafy...",
  "ipfsUri": "ipfs://bafy...",
  "gatewayUrl": "https://gateway.pinata.cloud/ipfs/bafy...",
  "integrity": { "verified": true }
}
```

Returns `503` when Pinata is not configured (there is no useful fallback for an
image), `400` when the `file` field is missing or empty, `413` above the size
limit, and `415` for a disallowed type.

---

## Known inconsistencies

Recorded here rather than left for an integrator to discover:

- `/api/ipfs/upload` and `/api/ipfs/upload-file` return a flat `{ error: string }`
  body for some validation failures instead of the `{ error: { code, message } }`
  envelope. The code is still available from the HTTP status.
- `X-RateLimit-Reset` carries **seconds until reset**, not the Unix timestamp the
  name implies in some conventions.
- The rate limiter is per instance and in memory, so limits multiply under
  horizontal scaling and reset on deploy. A shared store is tracked in
  [`../ISSUES.md`](../ISSUES.md).

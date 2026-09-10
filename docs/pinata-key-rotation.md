# Pinata API Key Rotation

BezaMint uploads NFT metadata and assets to IPFS through Pinata. The
`PINATA_JWT` secret controls that integration, so it should be treated
as sensitive infrastructure: rotate it periodically, revoke it when it
leaks, and avoid sharing it between environments.

## Key facts

- The server reads `PINATA_JWT` at **request time** (see
  `src/lib/pinata.ts`), not at build time. No restart is required after
  changing the secret — the next upload request picks it up.
- `NEXT_PUBLIC_PINATA_GATEWAY` is **public by design** (it is shipped to
  the browser so image URLs can resolve). Only `PINATA_JWT` is secret.
- The startup/health check reports `PINATA_JWT` as a warning when it is
  unset, so a missing secret is visible in `/api/health` rather than
  surfacing later as a confusing upload failure.

## When to rotate

- Scheduled: rotate at least every 90 days.
- Immediately: any suspected exposure — commit to a repo, paste in a
  chat, or leak through logs or error reporting.
- Environment changes: when promoting a new environment, give it its own
  key scoped to its own Pinata account/workspace.

## Rotation procedure

1. In the Pinata dashboard, create a new API key with the same scope as
   the current one (the app needs `pinFileToIPFS` / `pinJSONToIPFS`
   write access plus gateway read access).
2. Set the new value for `PINATA_JWT` in the deployment environment
   (and in any local `.env.local` used by developers).
3. Trigger a quick smoke test: upload a small file via
   `POST /api/ipfs/upload-file` and confirm a CID comes back, then
   verify the metadata upload route
   (`POST /api/ipfs/upload`) returns a resolved gateway URL.
4. Only after the new key works, revoke the old key in the dashboard.

The two-key overlap window (steps 2–4) means an in-flight upload can
never fail because the old key was revoked too early.

## Startup presence check

`collectStartupIssues()` in `src/lib/startup.ts` validates `PINATA_JWT`
at boot:

- **Missing** → warning: "IPFS uploads will fall back to placeholder
  URIs". The app still runs, but uploads return `ipfs://` placeholder
  values instead of real pins.
- **Present** → no issue; the health route additionally performs a live
  gateway reachability probe.

This check is deliberately a warning rather than an error so local
development without a key stays friction-free, while production
deployments surface the omission in `/api/health`.

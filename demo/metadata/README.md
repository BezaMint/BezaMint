# Sample metadata and artwork

Everything under this directory is **generated** and **committed**, in that order.
`scripts/seed-testnet-activity.sh` reads it to seed a deployed testnet, so the
platform's read routes have real events behind them instead of returning empty
arrays.

```bash
pnpm demo:metadata          # regenerate
pnpm demo:metadata:check    # what CI runs: fail if the tree is stale
pnpm demo:seed              # seed the deployment named by apps/web/.env.local
```

## Why the files are in the repository

A seeded token needs a `metadata_uri` that resolves. The platform's own upload
path pins to IPFS, which needs a Pinata credential that a fresh clone, a CI run
and a reviewer do not have. Pointing the demo tokens at files committed here
means a testnet deployment renders correctly with **no third-party service and no
secret**, and a reviewer can read the exact document a token points at.

The same reasoning applies to the artwork: `demo/art/` holds eighteen SVGs served
by `raw.githubusercontent.com`.

The trade-off is explicit: these URIs are only stable while this repository is
public at its current path. The on-chain URIs cannot be rewritten once written, so
**file names are part of the public interface.** Renaming a file breaks every
token already minted against it. `pnpm demo:metadata:check` exists so that a
rename surfaces as a failing check rather than as a silently dangling URI.

## Layout

| Path                      | Contents                                                                         |
| ------------------------- | -------------------------------------------------------------------------------- |
| `collections/<slug>.json` | One collection document per seeded collection. Carries the royalty basis points. |
| `tokens/<slug>-<nn>.json` | One NFT document per token, so every token renders its own name and image.       |
| `../art/<slug>-<nn>.svg`  | The artwork each token document points at.                                       |

`scripts/generate-demo-metadata.mjs` derives all three from the table at the top
of that script, including each token's `imageUri` from its own file name, so a
token cannot point at another token's art. Artwork is drawn from a seeded PRNG
keyed by the token's name: output is byte-for-byte reproducible, and running the
generator twice produces no diff. Nothing here is hand-edited; edit the table and
regenerate.

## Royalties

The `royalties` field in a collection document is basis points (250 = 2.5%), and
the seed script passes that same number to
`factory.mint_batch_with_royalty`. One source of truth means the figure a UI
displays and the figure the contract enforces cannot drift apart.

Note that the Factory configures royalty **per token**, not per collection — see
`mint_one` in `contracts/factory/src/lib.rs` — so the value is recorded on each of
the six tokens with the deployer as the recorded creator.

## Schema

Every document conforms to the schema enforced by
`apps/web/src/lib/server/metadataSchema.ts`, the same validator the upload route
applies. `additionalProperties: false` means an unexpected key is a validation
error, so a stray field will fail the test that guards this tree rather than
reaching a user. `imageUri`, `externalUrl` and `collectionId` are all within the
schema's length limits, and below the NFT contract's 512-byte `metadata_uri` cap.

## Not a production template

These are demo assets. Production collections should pin to IPFS and carry an
on-chain content commitment, and the metadata is served by a host the project does
not control. Both gaps are tracked in [`../../ISSUES.md`](../../ISSUES.md).

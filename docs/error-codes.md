# BezaMint Contract Error Codes

<!-- GENERATED FILE - do not edit by hand.
     Source: the #[contracterror] enum in contracts/<name>/src/lib.rs
     Generator: scripts/generate-error-catalog.py
     Regenerate: pnpm run contract:errors
     CI verifies this file with: pnpm run contract:errors:check -->

Every BezaMint contract raises typed numeric codes instead of formatted panic
strings. When a contract call fails, the Soroban host reports it as
`Error(Contract, #N)` — an integer with no name attached. This page maps each
integer back to its variant, what it means, and which functions can raise it.
**76 codes** are in use across the five contracts.

## Decoding a failure

A simulation or submission failure carries the code in the error text. The same
integer means different things in different contracts, so the contract that was
called is part of the answer:

```text
HostError: Error(Contract, #12)
                       │
                       └── contract-specific code; see the tables below
```

The web application parses this into a structured value: `normalizeError`
attaches `details.contractError = { code, contract, variant, meaning }` whenever
the message carries an `Error(Contract, #N)`. `variant` and `meaning` are `null`
when the code is unknown to the catalog (a contract deployed ahead of the web
app, for example), and the numeric `code` is still reported. The TypeScript side
of this catalog lives in `apps/web/src/lib/contractErrors.ts`, generated from the
same source as this page.

Codes are **per contract**, not global: `#1` is `NotInitialized` everywhere

by convention, but nothing enforces that across enums.

## Summary

| Contract | Enum | Codes | Range |
| -------- | ---- | ----- | ----- |
| nft | `NftError` | 15 | 1–15 |
| collection | `CollectionError` | 14 | 1–14 |
| royalty | `RoyaltyError` | 15 | 1–15 |
| creator | `CreatorError` | 17 | 1–17 |
| factory | `FactoryError` | 15 | 1–15 |

## `nft` — `NftError`

15 codes.

| Code | Variant | Raised by | Meaning |
| ---- | ------- | --------- | ------- |
| 1 | `NotInitialized` | `get_admin`, `migrate`, `mint`, `set_admin`, `upgrade` | The contract has not been constructed. |
| 2 | `StorageVersionMismatch` | `assert_version` | Stored schema version does not match this build; run `migrate`. |
| 3 | `StoredVersionMismatch` | `migrate` | `migrate` was given a `from_version` that is not what is stored. |
| 4 | `AlreadyAtCurrentVersion` | `migrate` | `migrate` called when storage is already at this build's version. |
| 5 | `MetadataUriEmpty` | `mint` | Metadata URI is empty. |
| 6 | `MetadataUriTooLong` | `mint` | Metadata URI exceeds `MAX_METADATA_URI_LEN`. |
| 7 | `MetadataUriSchemeInvalid` | `mint` | Metadata URI does not use an https, http or ipfs scheme. |
| 8 | `ZeroAddress` | `assert_not_zero`, `set_admin` | The all-zero account was supplied where a real account is required. |
| 9 | `MaxSupplyReached` | `mint` | `MAX_SUPPLY` has been reached. |
| 10 | `TokenNotFound` | `approve`, `burn`, `owner_of`, `transfer`, `transfer_from` | No token exists with the supplied id. |
| 11 | `CallerNotOwner` | `transfer` | `transfer` caller is not the current owner. |
| 12 | `FromIsNotOwner` | `transfer_from` | `transfer_from` `from` is not the current owner. |
| 13 | `SpenderNotApproved` | `transfer_from` | `transfer_from` spender holds no per-token or blanket approval. |
| 14 | `TokenDataNotFound` | `token_data` | The token exists but its data record is gone (for example after a burn). |
| 15 | `OwnershipIndexInconsistent` | `index_remove` | The per-owner index is inconsistent. Indicates a logic defect, not caller error; reachable only if the swap-removal invariant is broken. |

## `collection` — `CollectionError`

14 codes.

| Code | Variant | Raised by | Meaning |
| ---- | ------- | --------- | ------- |
| 1 | `NotInitialized` | `create_collection`, `get_admin`, `migrate`, `set_admin`, `upgrade` | The contract has not been constructed. |
| 2 | `StorageVersionMismatch` | `assert_version` | Stored schema version does not match this build; run `migrate`. |
| 3 | `StoredVersionMismatch` | `migrate` | `migrate` was given a `from_version` that is not what is stored. |
| 4 | `AlreadyAtCurrentVersion` | `migrate` | `migrate` called when storage is already at this build's version. |
| 5 | `MetadataUriEmpty` | `validate_metadata_uri` | Metadata URI is empty. |
| 6 | `MetadataUriTooLong` | `validate_metadata_uri` | Metadata URI exceeds `MAX_METADATA_URI_LEN`. |
| 7 | `MetadataUriSchemeInvalid` | `validate_metadata_uri` | Metadata URI does not use an https, http or ipfs scheme. |
| 8 | `CollectionNotFound` | `add_nft`, `archive_collection`, `get_collection`, `remove_nft`, `update_collection` | No collection exists with the supplied id. |
| 9 | `NotCollectionCreator` | `archive_collection`, `update_collection` | Caller is not the collection's creator. |
| 10 | `CollectionArchived` | `add_nft`, `update_collection` | The collection is archived and cannot be mutated. |
| 11 | `CollectionFull` | `add_nft` | `MAX_NFTS_PER_COLLECTION` reached. |
| 12 | `TokenAlreadyInCollection` | `add_nft` | The token already belongs to a collection. |
| 13 | `NftIndexOutOfBounds` | `remove_nft` | Internal membership index is out of bounds. Indicates a logic defect, not caller error. |
| 14 | `AdminZeroAddress` | `set_admin` | `set_admin` was given the all-zero account. |

## `royalty` — `RoyaltyError`

15 codes.

| Code | Variant | Raised by | Meaning |
| ---- | ------- | --------- | ------- |
| 1 | `NotInitialized` | `configure_royalty`, `freeze_royalty`, `get_admin`, `migrate`, `remove_royalty`, `set_admin`, `update_royalty`, `upgrade` | The contract has not been constructed. |
| 2 | `StorageVersionMismatch` | `assert_version` | Stored schema version does not match this build; run `migrate`. |
| 3 | `StoredVersionMismatch` | `migrate` | `migrate` was given a `from_version` that is not what is stored. |
| 4 | `AlreadyAtCurrentVersion` | `migrate` | `migrate` called when storage is already at this build's version. |
| 5 | `NoConfig` | `freeze_royalty`, `get_royalty`, `remove_royalty`, `update_royalty` | No royalty terms exist for the target. |
| 6 | `ConfigAlreadyExists` | `configure_royalty` | Terms already exist; use `update_royalty` instead. |
| 7 | `BasisPointsTooHigh` | `configure_royalty`, `update_royalty` | Rate exceeds `MAX_BASIS_POINTS`. |
| 8 | `CallerCannotUpdate` | `update_royalty` | Caller is neither the recorded creator nor the royalty admin. |
| 9 | `ConfigFrozen` | `remove_royalty`, `update_royalty` | Terms are frozen and cannot be amended or removed. |
| 10 | `TooManyRecipients` | `validate_recipients` | More recipients than `MAX_RECIPIENTS`. |
| 11 | `ZeroShare` | `validate_recipients` | A recipient was given a zero share. |
| 12 | `SharesMustSumToTotal` | `validate_recipients` | Recipient shares do not sum to exactly `TOTAL_SHARE`. |
| 13 | `SalePriceNegative` | `quote_royalty` | `quote_royalty` was given a negative sale price. |
| 14 | `SalePriceTooLarge` | `quote_royalty` | `sale_price * basis_points` overflowed i128. |
| 15 | `AdminZeroAddress` | `set_admin` | `set_admin` was given the all-zero account. |

## `creator` — `CreatorError`

17 codes.

| Code | Variant | Raised by | Meaning |
| ---- | ------- | --------- | ------- |
| 1 | `NotInitialized` | `get_admin`, `migrate`, `set_admin`, `upgrade`, `verify_creator` | The contract has not been constructed. |
| 2 | `StorageVersionMismatch` | `assert_version` | Stored schema version does not match this build; run `migrate`. |
| 3 | `StoredVersionMismatch` | `migrate` | `migrate` was given a `from_version` that is not what is stored. |
| 4 | `AlreadyAtCurrentVersion` | `migrate` | `migrate` called when storage is already at this build's version. |
| 5 | `DisplayNameEmpty` | `register`, `update_profile` | Display name is empty. |
| 6 | `DisplayNameTooLong` | `register`, `update_profile` | Display name exceeds `MAX_DISPLAY_NAME_LEN`. |
| 7 | `BioTooLong` | `register`, `update_profile` | Bio exceeds `MAX_BIO_LEN`. |
| 8 | `UriTooLong` | `validate_uri` | A profile URI exceeds `MAX_URI_LEN`. |
| 9 | `UriSchemeInvalid` | `validate_uri` | A profile URI does not use an https, http or ipfs scheme. |
| 10 | `AlreadyRegistered` | `register` | The address is already registered. |
| 11 | `ProfileNotFound` | `get_profile`, `set_social_links`, `update_profile`, `verify_creator` | No profile exists for the address. |
| 12 | `TooManySocialLinks` | `validate_social_links` | More links than `MAX_SOCIAL_LINKS`. |
| 13 | `PlatformNameTooLong` | `validate_social_links` | Platform name exceeds `MAX_PLATFORM_LEN`. |
| 14 | `UnsupportedPlatform` | `validate_social_links` | Platform is not on the allowlist. |
| 15 | `SocialUrlLengthInvalid` | `validate_social_links` | Social URL is empty or exceeds `MAX_SOCIAL_URL_LEN`. |
| 16 | `SocialUrlSchemeInvalid` | `validate_social_links` | Social URL does not use an https or http scheme. |
| 17 | `AdminZeroAddress` | `set_admin` | `set_admin` was given the all-zero account. |

## `factory` — `FactoryError`

15 codes.

| Code | Variant | Raised by | Meaning |
| ---- | ------- | --------- | ------- |
| 1 | `NotInitialized` | `get_admin`, `migrate`, `set_admin`, `set_contracts`, `set_royalty_admin`, `upgrade` | The contract has not been constructed. |
| 2 | `StorageVersionMismatch` | `assert_version` | Stored schema version does not match this build; run `migrate`. |
| 3 | `StoredVersionMismatch` | `migrate` | `migrate` was given a `from_version` that is not what is stored. |
| 4 | `AlreadyAtCurrentVersion` | `migrate` | `migrate` called when storage is already at this build's version. |
| 5 | `RoyaltyAdminZeroAddress` | `set_royalty_admin` | `set_royalty_admin` was given the all-zero account. |
| 6 | `WiringZeroAddress` | `validate_wiring` | A wired contract address is the all-zero account. |
| 7 | `WiringSelfReference` | `validate_wiring` | A wired contract slot points at the Factory itself. |
| 8 | `WiringDuplicate` | `validate_wiring` | Two or more wired slots resolve to the same contract. |
| 9 | `BatchEmpty` | `mint_batch_with_royalty` | `mint_batch_with_royalty` was given an empty batch. |
| 10 | `BatchTooLarge` | `mint_batch_with_royalty` | `mint_batch_with_royalty` exceeded `MAX_BATCH_MINT`. |
| 11 | `NftContractNotSet` | `burn_nft`, `get_nft_contract`, `mint_contracts` | The NFT contract slot is not wired. |
| 12 | `CollectionContractNotSet` | `burn_nft`, `create_collection_for_creator`, `get_collection_contract`, `mint_contracts` | The Collection contract slot is not wired. |
| 13 | `RoyaltyContractNotSet` | `get_royalty_contract`, `mint_contracts`, `set_royalty_admin` | The Royalty contract slot is not wired. |
| 14 | `CreatorContractNotSet` | `create_collection_for_creator`, `get_creator_contract` | The Creator contract slot is not wired. |
| 15 | `AdminZeroAddress` | `set_admin` | `set_admin` was given the all-zero account. |

## Editing this catalog

Do not edit this file directly. Add or change the variant's doc comment in

`contracts/<name>/src/lib.rs`, then run:

```bash
pnpm run contract:errors
```

`pnpm run contract:errors:check` runs in CI and fails if the committed catalog
does not match the contracts, so a new code cannot land undocumented.

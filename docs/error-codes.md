# BezaMint Error Codes

<!-- GENERATED FILE - do not edit by hand.
     Source: the #[contracterror] enum in contracts/<name>/src/lib.rs
     Generator: scripts/generate-error-catalog.py
     Regenerate: pnpm run contract:errors
     CI verifies this file with: pnpm run contract:errors:check -->

Every BezaMint contract raises typed numeric codes instead of formatted panic
strings. When a contract call fails, the Soroban host reports it as
`Error(Contract, #N)` — an integer with no name attached. This page maps each
integer back to its variant, what it means, and which functions can raise it.
**78 codes** are in use across the five contracts, and every other
failure the system can produce or surface has a named code below. The two
halves are generated from their own sources so neither can drift from the
code that raises it.

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
| royalty | `RoyaltyError` | 17 | 1–17 |
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

17 codes.

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
| 16 | `SalePriceNotPositive` | `pay_royalty` | `pay_royalty` was given a sale price of zero or less. Distinct from `RoyaltyError::SalePriceNegative`, which `quote_royalty` accepts as long as the price is not negative: quoting a zero sale is a harmless question, while settling one would spend a transaction to move nothing. |
| 17 | `AssetZeroAddress` | `pay_royalty` | `pay_royalty` was given the all-zero account as the settlement asset. The zero account is not a deployed contract, so the transfer would fail after the payouts were computed, with nothing to show for the fee. |

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

## Application and protocol codes

Contract codes are numbered per contract and carry no name until this page
maps them. Everything else the system can fail with has a symbolic name from
the outset, because those failures are raised by code this repository owns or
observed from a dependency it calls. They are declared in
`packages/shared/src/errors/`, and `scripts/check-error-codes.py` fails CI when
a declared code has no call site — so every row below is reachable, not
aspirational.

Each code also carries a stable `BM-<DOMAIN>-<NNNN>` identifier. Clients branch
on the name; operators grep logs and configure alerts on the identifier. Both
are published and neither is ever reused.

| Domain | Codes |
| ------ | ----: |
| `api` | 13 |
| `auth` | 7 |
| `validation` | 16 |
| `wallet` | 10 |
| `transaction` | 7 |
| `ipfs` | 19 |
| `metadata` | 12 |
| `indexer` | 14 |
| `config` | 13 |
| `ui` | 8 |
| `protocol` | 43 |

### Stellar protocol codes

These are the network's own result codes, not ours. `classifyProtocolError` maps
them onto the names below so a rejection says what actually failed: a stale
sequence number and an underfunded account were previously both reported as
`INTERNAL`. The list covers every member of the SDK's `TransactionResultCode`,
`OperationResultCode`, `InvokeHostFunctionResultCode` and `PaymentResultCode`
enums that represents a failure, plus the host error families the host reports
as text; `errors.test.ts` fails if a future SDK adds a member this table does not
account for.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-PROTOCOL-0001` | `TX_REJECTED_BY_NETWORK` | 422 | no | The network rejected the transaction |
| `BM-PROTOCOL-0002` | `TX_SUBMITTED_TOO_EARLY` | 409 | yes | The transaction is not valid yet; the time bounds start later |
| `BM-PROTOCOL-0003` | `TX_SUBMITTED_TOO_LATE` | 409 | no | The transaction time bounds have expired |
| `BM-PROTOCOL-0004` | `TX_MISSING_OPERATION` | 400 | no | The transaction carries no operation |
| `BM-PROTOCOL-0005` | `TX_SEQUENCE_STALE` | 409 | yes | The account sequence number is out of date; refresh and try again |
| `BM-PROTOCOL-0006` | `TX_SIGNATURE_INVALID` | 403 | no | The transaction signature does not match the source account |
| `BM-PROTOCOL-0007` | `TX_INSUFFICIENT_BALANCE` | 400 | no | The source account does not hold enough XLM to pay for this |
| `BM-PROTOCOL-0008` | `TX_SOURCE_ACCOUNT_MISSING` | 400 | no | The source account is not funded on this network |
| `BM-PROTOCOL-0009` | `TX_FEE_TOO_LOW` | 409 | yes | The offered fee is below the network minimum |
| `BM-PROTOCOL-0010` | `TX_SIGNED_BY_UNEXPECTED_ACCOUNT` | 403 | no | The transaction carries a signature it should not |
| `BM-PROTOCOL-0011` | `TX_NETWORK_INTERNAL_ERROR` | 502 | yes | The network reported an internal error; retry shortly |
| `BM-PROTOCOL-0012` | `TX_NOT_SUPPORTED_BY_NETWORK` | 422 | no | This network does not support the requested transaction |
| `BM-PROTOCOL-0013` | `TX_FEE_BUMP_INNER_FAILED` | 422 | no | The inner transaction of the fee bump failed |
| `BM-PROTOCOL-0014` | `TX_SPONSORSHIP_INVALID` | 422 | no | The transaction breaks sponsorship rules |
| `BM-PROTOCOL-0015` | `TX_MIN_SEQUENCE_AGE_OR_GAP` | 409 | no | The transaction does not satisfy the account minimum sequence age or gap |
| `BM-PROTOCOL-0016` | `TX_MALFORMED_ENVELOPE` | 400 | no | The transaction envelope is malformed |
| `BM-PROTOCOL-0017` | `TX_SOROBAN_INVALID` | 422 | no | The Soroban part of the transaction is invalid |
| `BM-PROTOCOL-0018` | `OP_SIGNATURE_INVALID` | 403 | no | An operation signature does not match the account it claims |
| `BM-PROTOCOL-0019` | `OP_ACCOUNT_MISSING` | 400 | no | An account an operation refers to does not exist |
| `BM-PROTOCOL-0020` | `OP_NOT_SUPPORTED` | 422 | no | An operation in this transaction is not supported here |
| `BM-PROTOCOL-0021` | `OP_TOO_MANY_SUBENTRIES` | 422 | no | The transaction would exceed the account subentry limit |
| `BM-PROTOCOL-0022` | `OP_EXCEEDED_WORK_LIMIT` | 429 | yes | The transaction exceeded the compute work limit |
| `BM-PROTOCOL-0023` | `OP_TOO_MANY_SPONSORING` | 422 | no | The transaction exceeds the sponsorship limit |
| `BM-PROTOCOL-0024` | `HOST_FUNCTION_MALFORMED` | 400 | no | The contract invocation is malformed |
| `BM-PROTOCOL-0025` | `HOST_FUNCTION_TRAPPED` | 422 | no | The contract trapped; its state was not changed |
| `BM-PROTOCOL-0026` | `HOST_RESOURCE_LIMIT_EXCEEDED` | 429 | no | The invocation exceeded the resource limit |
| `BM-PROTOCOL-0027` | `HOST_ENTRY_ARCHIVED` | 409 | yes | A ledger entry the call needs has been archived and must be restored |
| `BM-PROTOCOL-0028` | `HOST_REFUNDABLE_FEE_INSUFFICIENT` | 409 | yes | The refundable fee is too low for the resources the call needs |
| `BM-PROTOCOL-0029` | `PAYMENT_MALFORMED` | 400 | no | The payment operation is malformed |
| `BM-PROTOCOL-0030` | `PAYMENT_UNDERFUNDED` | 400 | no | The source account does not hold enough of this asset |
| `BM-PROTOCOL-0031` | `PAYMENT_SOURCE_NO_TRUST` | 400 | no | The source account has no trustline for this asset |
| `BM-PROTOCOL-0032` | `PAYMENT_SOURCE_NOT_AUTHORIZED` | 403 | no | The source account is not authorized to hold this asset |
| `BM-PROTOCOL-0033` | `PAYMENT_NO_DESTINATION` | 400 | no | The destination account does not exist |
| `BM-PROTOCOL-0034` | `PAYMENT_NO_TRUST` | 400 | no | The destination account has no trustline for this asset |
| `BM-PROTOCOL-0035` | `PAYMENT_NOT_AUTHORIZED` | 403 | no | The destination account is not authorized to hold this asset |
| `BM-PROTOCOL-0036` | `PAYMENT_LINE_FULL` | 409 | no | The destination trustline cannot hold this much of the asset |
| `BM-PROTOCOL-0037` | `PAYMENT_NO_ISSUER` | 400 | no | The asset has no issuer on this network |
| `BM-PROTOCOL-0038` | `HOST_AUTH_FAILED` | 403 | no | The contract required an authorization that the transaction did not carry |
| `BM-PROTOCOL-0039` | `HOST_BUDGET_EXCEEDED` | 429 | no | The invocation ran out of CPU or memory budget |
| `BM-PROTOCOL-0040` | `HOST_STORAGE_ENTRY_LIMIT` | 422 | no | The invocation would exceed the ledger entry limit |
| `BM-PROTOCOL-0041` | `HOST_WASM_INVALID` | 500 | no | The contract wasm could not be executed |
| `BM-PROTOCOL-0042` | `HOST_TTL_EXPIRED` | 409 | yes | A ledger entry reached the end of its time to live |
| `BM-PROTOCOL-0043` | `HOST_CONTEXT_INVALID` | 500 | no | The host rejected the invocation context |

### `api` — HTTP outcomes the API returns

13 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-API-0001` | `BAD_REQUEST` | 400 | no | The request could not be understood |
| `BM-API-0002` | `UNAUTHORIZED` | 401 | no | Authentication required |
| `BM-API-0003` | `FORBIDDEN` | 403 | no | Not allowed |
| `BM-API-0004` | `NOT_FOUND` | 404 | no | Not found |
| `BM-API-0005` | `CONTRACT_ERROR` | 422 | no | A contract call failed |
| `BM-API-0006` | `RATE_LIMITED` | 429 | no | Too many requests |
| `BM-API-0007` | `INTERNAL` | 500 | no | Internal server error |
| `BM-API-0008` | `NETWORK_ERROR` | 502 | yes | An upstream service could not be reached |
| `BM-API-0009` | `TIMEOUT` | 504 | yes | An upstream service did not answer in time |
| `BM-API-0010` | `COLLECTION_ARCHIVED` | 409 | no | The collection is archived and rejects new members |
| `BM-API-0011` | `TOKEN_ALREADY_IN_COLLECTION` | 409 | no | The token already belongs to a collection |
| `BM-API-0012` | `CONTRACT_NOT_CONFIGURED` | 503 | no | A required contract id is not configured |
| `BM-API-0013` | `INDEXER_UNAVAILABLE` | 503 | yes | The indexer has not produced a usable snapshot yet |

### `auth` — Authentication and authorization

7 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-AUTH-0001` | `API_KEY_REQUIRED` | 401 | no | This endpoint requires an API key |
| `BM-AUTH-0002` | `API_KEY_INVALID` | 401 | no | The supplied API key is not valid |
| `BM-AUTH-0003` | `ORIGIN_REQUIRED` | 403 | no | A browser origin is required for this request |
| `BM-AUTH-0004` | `ORIGIN_NOT_ALLOWED` | 403 | no | That origin is not allowed to call this endpoint |
| `BM-AUTH-0005` | `CONTENT_TYPE_NOT_ALLOWED` | 415 | no | That content type is not accepted here |
| `BM-AUTH-0006` | `PREFLIGHT_REJECTED` | 403 | no | The preflight request was refused |
| `BM-AUTH-0007` | `ADMIN_REQUIRED` | 403 | no | Only the contract admin may do this |

### `validation` — Input validation rules

16 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-VALIDATION-0001` | `NAME_REQUIRED` | 400 | no | A name is required |
| `BM-VALIDATION-0002` | `NAME_TOO_LONG` | 400 | no | The name is longer than the limit |
| `BM-VALIDATION-0003` | `DESCRIPTION_TOO_LONG` | 400 | no | The description is longer than the limit |
| `BM-VALIDATION-0004` | `DISPLAY_NAME_REQUIRED` | 400 | no | A display name is required |
| `BM-VALIDATION-0005` | `DISPLAY_NAME_TOO_LONG` | 400 | no | The display name is longer than the limit |
| `BM-VALIDATION-0006` | `ADDRESS_REQUIRED` | 400 | no | A Stellar account address is required |
| `BM-VALIDATION-0007` | `ADDRESS_MALFORMED` | 400 | no | Not a valid Stellar account address |
| `BM-VALIDATION-0008` | `PARAMETER_NOT_INTEGER` | 400 | no | A numeric parameter is not an integer |
| `BM-VALIDATION-0009` | `PARAMETER_NEGATIVE` | 400 | no | A numeric parameter is negative |
| `BM-VALIDATION-0010` | `BASIS_POINTS_OUT_OF_RANGE` | 400 | no | Royalty basis points are outside 0–10000 |
| `BM-VALIDATION-0011` | `ROYALTY_RECIPIENTS_TOO_MANY` | 400 | no | More royalty recipients than the contract accepts |
| `BM-VALIDATION-0012` | `ROYALTY_SHARE_SUM_INVALID` | 400 | no | Royalty shares must total exactly 100 |
| `BM-VALIDATION-0013` | `ROYALTY_SHARE_OUT_OF_RANGE` | 400 | no | A royalty share is outside 0–100 |
| `BM-VALIDATION-0014` | `URL_MALFORMED` | 400 | no | Not a usable absolute URL |
| `BM-VALIDATION-0015` | `JSON_BODY_REQUIRED` | 400 | no | A JSON request body is required |
| `BM-VALIDATION-0016` | `JSON_BODY_MALFORMED` | 400 | no | The request body is not valid JSON |

### `wallet` — Browser wallet failures

10 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-WALLET-0001` | `WALLET_NOT_INSTALLED` | — | no | The Freighter browser extension is not installed |
| `BM-WALLET-0002` | `WALLET_NOT_CONNECTED` | — | no | The wallet is installed but not connected to a site |
| `BM-WALLET-0003` | `WALLET_ACCESS_DENIED` | — | no | The wallet refused this site access to the account |
| `BM-WALLET-0004` | `WALLET_REQUEST_TIMEOUT` | — | yes | The wallet did not answer before the request timed out |
| `BM-WALLET-0005` | `WALLET_USER_REJECTED` | — | no | The request was rejected in the wallet |
| `BM-WALLET-0006` | `WALLET_WRONG_NETWORK` | — | no | The wallet is on a different network than the app |
| `BM-WALLET-0007` | `WALLET_ACCOUNT_CHANGED` | — | no | The wallet account changed during the flow |
| `BM-WALLET-0008` | `WALLET_UNSUPPORTED_METHOD` | — | no | The wallet does not implement this method |
| `BM-WALLET-0009` | `WALLET_BRIDGE_ERROR` | — | no | The wallet extension returned an unusable response |
| `BM-WALLET-0010` | `WALLET_POPUP_BLOCKED` | — | no | The wallet window was blocked by the browser |

### `transaction` — Building, signing and submitting a transaction

7 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-TX-0001` | `TX_AUTH_ENTRY_MISSING` | 403 | no | Simulation asked for an authorization that was not signed |
| `BM-TX-0002` | `TX_CONFIRMATION_TIMEOUT` | 504 | yes | The transaction was not confirmed before the deadline |
| `BM-TX-0003` | `TX_RESULT_FAILED` | 422 | no | The transaction was included but failed |
| `BM-TX-0004` | `TX_INCLUSION_MISSING` | 502 | yes | The transaction was submitted but never included |
| `BM-TX-0005` | `TX_SIGNING_FAILED` | — | no | The wallet could not sign the transaction |
| `BM-TX-0006` | `TX_XDR_MALFORMED` | 400 | no | The transaction envelope is not valid base64 XDR |
| `BM-TX-0007` | `TX_FEE_UNPAYABLE` | 400 | no | The source account cannot pay the transaction fee |

### `ipfs` — Pinning and gateway reads

19 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-IPFS-0001` | `PINATA_NOT_CONFIGURED` | 503 | no | No Pinata credential is configured |
| `BM-IPFS-0002` | `PINATA_AUTH_FAILED` | 401 | no | Pinata rejected the credential |
| `BM-IPFS-0003` | `PINATA_RATE_LIMITED` | 429 | yes | Pinata is rate limiting this deployment |
| `BM-IPFS-0004` | `PINATA_UPSTREAM_ERROR` | 502 | yes | Pinata returned an error |
| `BM-IPFS-0005` | `PIN_UPLOAD_FAILED` | 502 | no | The file could not be pinned |
| `BM-IPFS-0006` | `PIN_JSON_FAILED` | 502 | no | The JSON document could not be pinned |
| `BM-IPFS-0007` | `PIN_TIMEOUT` | 504 | yes | Pinning did not complete before the deadline |
| `BM-IPFS-0008` | `PIN_CID_MISSING` | 502 | no | The pin response carried no CID |
| `BM-IPFS-0009` | `GATEWAY_UNREACHABLE` | 502 | yes | No configured gateway could be reached |
| `BM-IPFS-0010` | `GATEWAY_THROTTLED` | 429 | yes | Every configured gateway refused the request |
| `BM-IPFS-0011` | `GATEWAY_TIMEOUT` | 504 | yes | The gateway did not answer before the deadline |
| `BM-IPFS-0012` | `CONTENT_NOT_FOUND` | 404 | no | The gateway has no content for that CID |
| `BM-IPFS-0013` | `CONTENT_HASH_MISMATCH` | 502 | no | The gateway returned content that does not match the CID |
| `BM-IPFS-0014` | `CID_MALFORMED` | 400 | no | Not a valid CID |
| `BM-IPFS-0015` | `CID_ENCODING_UNSUPPORTED` | 400 | no | That CID uses a base encoding this app does not handle |
| `BM-IPFS-0016` | `CID_MULTIHASH_UNSUPPORTED` | 400 | no | That CID uses a hash function this app does not handle |
| `BM-IPFS-0017` | `CID_DIGEST_MISMATCH` | 502 | no | The CID digest does not match the bytes it names |
| `BM-IPFS-0018` | `PIN_NOT_PROPAGATED` | 409 | yes | The pin succeeded but the content is not reachable yet |
| `BM-IPFS-0019` | `GATEWAY_FALLBACK_EXHAUSTED` | 502 | yes | Every configured gateway was tried and refused |

### `metadata` — Metadata resolution and document shape

12 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-METADATA-0001` | `DOCUMENT_NOT_JSON` | 502 | no | The metadata document is not JSON |
| `BM-METADATA-0002` | `DOCUMENT_SCHEMA_INVALID` | 422 | no | The metadata document does not match the expected shape |
| `BM-METADATA-0003` | `DOCUMENT_NAME_MISSING` | 422 | no | The metadata document carries no name |
| `BM-METADATA-0004` | `DOCUMENT_IMAGE_MISSING` | 422 | no | The metadata document carries no image |
| `BM-METADATA-0005` | `DOCUMENT_ATTRIBUTES_NOT_ARRAY` | 422 | no | The metadata document attributes are not a list |
| `BM-METADATA-0006` | `DOCUMENT_PROPERTIES_NOT_OBJECT` | 422 | no | The metadata document properties are not an object |
| `BM-METADATA-0007` | `DOCUMENT_TOO_LARGE` | 413 | no | The metadata document is larger than the accepted limit |
| `BM-METADATA-0008` | `URI_NOT_IPFS` | 400 | no | The URI is not an IPFS URI, so it has no CID to resolve |
| `BM-METADATA-0009` | `RESOLVER_TIMEOUT` | 504 | yes | Metadata resolution timed out |
| `BM-METADATA-0010` | `RESOLVER_REDIRECT_UNSAFE` | 400 | no | Metadata resolution was redirected somewhere not allowed |
| `BM-METADATA-0011` | `RESOLVER_STATUS_ERROR` | 502 | yes | Metadata resolution returned a failing status |
| `BM-METADATA-0012` | `TOKEN_METADATA_MISSING` | 404 | no | No metadata could be resolved for that token |

### `indexer` — Reading the chain into a snapshot

14 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-INDEXER-0001` | `RPC_UNREACHABLE` | 502 | yes | The Soroban RPC endpoint could not be reached |
| `BM-INDEXER-0002` | `RPC_TIMEOUT` | 504 | yes | The Soroban RPC endpoint did not answer in time |
| `BM-INDEXER-0003` | `RPC_REJECTED` | 502 | no | The Soroban RPC endpoint rejected the request |
| `BM-INDEXER-0004` | `EVENT_CURSOR_INVALID` | 500 | no | The stored event cursor is not usable |
| `BM-INDEXER-0005` | `CURSOR_REGRESSION` | 500 | no | The event cursor moved backwards |
| `BM-INDEXER-0006` | `EVENT_DECODE_FAILED` | 500 | no | An event payload could not be decoded |
| `BM-INDEXER-0007` | `EVENT_UNKNOWN_TOPIC` | 500 | no | An event carries a topic the indexer does not know |
| `BM-INDEXER-0008` | `EVENT_SCHEMA_VERSION_UNSUPPORTED` | 500 | no | An event uses an unsupported schema version |
| `BM-INDEXER-0009` | `POLL_FAILED` | 502 | yes | A ledger poll failed |
| `BM-INDEXER-0010` | `LEDGER_RANGE_INVALID` | 500 | no | The requested ledger range is not usable |
| `BM-INDEXER-0011` | `START_LEDGER_MISSING` | 500 | no | The indexer could not determine where to start |
| `BM-INDEXER-0012` | `SNAPSHOT_READ_FAILED` | 500 | no | The cached index snapshot could not be read |
| `BM-INDEXER-0013` | `SNAPSHOT_WRITE_FAILED` | 500 | no | The index snapshot could not be persisted |
| `BM-INDEXER-0014` | `CONTRACT_IDS_INCOMPLETE` | 503 | no | The indexer is missing one or more contract ids |

### `config` — Deployment and build configuration

13 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-CONFIG-0001` | `NFT_CONTRACT_ID_MISSING` | 503 | no | NEXT_PUBLIC_NFT_CONTRACT_ID is not set |
| `BM-CONFIG-0002` | `COLLECTION_CONTRACT_ID_MISSING` | 503 | no | NEXT_PUBLIC_COLLECTION_CONTRACT_ID is not set |
| `BM-CONFIG-0003` | `ROYALTY_CONTRACT_ID_MISSING` | 503 | no | NEXT_PUBLIC_ROYALTY_CONTRACT_ID is not set |
| `BM-CONFIG-0004` | `CREATOR_CONTRACT_ID_MISSING` | 503 | no | NEXT_PUBLIC_CREATOR_CONTRACT_ID is not set |
| `BM-CONFIG-0005` | `FACTORY_CONTRACT_ID_MISSING` | 503 | no | NEXT_PUBLIC_FACTORY_CONTRACT_ID is not set |
| `BM-CONFIG-0006` | `RPC_URL_MISSING` | 503 | no | NEXT_PUBLIC_STELLAR_RPC_URL is not set |
| `BM-CONFIG-0007` | `NETWORK_PASSPHRASE_MISSING` | 503 | no | NEXT_PUBLIC_STELLAR_PASSPHRASE is not set |
| `BM-CONFIG-0008` | `APP_URL_MISSING` | 503 | no | NEXT_PUBLIC_APP_URL is not set |
| `BM-CONFIG-0009` | `WRITE_KEY_MISSING` | 500 | no | API_WRITE_KEY is not set in a production deployment |
| `BM-CONFIG-0010` | `CONTRACT_ID_MALFORMED` | 500 | no | A configured contract id is not a valid contract address |
| `BM-CONFIG-0011` | `ENV_VAR_MALFORMED` | 500 | no | An environment variable has an unexpected shape |
| `BM-CONFIG-0012` | `GATEWAY_URL_INVALID` | 500 | no | The configured IPFS gateway is not a usable http(s) URL |
| `BM-CONFIG-0013` | `NETWORK_MISMATCH` | 500 | no | The configured network and RPC endpoint do not agree |

### `ui` — Client-side failures a component or boundary caught

8 codes.

| Code | Name | HTTP | Retryable | Meaning |
| ---- | ---- | ---- | --------- | ------- |
| `BM-UI-0001` | `ERROR_BOUNDARY_CAUGHT` | — | no | A component tree threw and the error boundary caught it |
| `BM-UI-0002` | `ROUTE_ERROR_CAUGHT` | — | no | A route segment threw and the error page caught it |
| `BM-UI-0003` | `HYDRATION_FAILED` | — | no | The server-rendered markup did not match the client render |
| `BM-UI-0004` | `IMAGE_LOAD_FAILED` | — | no | An image could not be loaded from its gateway |
| `BM-UI-0005` | `IMAGE_FALLBACK_SHOWN` | — | no | An image failed and a placeholder was shown instead |
| `BM-UI-0006` | `CLIPBOARD_COPY_FAILED` | — | no | The browser refused access to the clipboard |
| `BM-UI-0007` | `SHARE_UNSUPPORTED` | — | no | This browser does not implement the share sheet |
| `BM-UI-0008` | `OFFLINE` | — | yes | The browser reports no network connection |

## Editing this catalog

Do not edit this file directly. Add or change the variant's doc comment in

`contracts/<name>/src/lib.rs`, then run:

```bash
pnpm run contract:errors
```

`pnpm run contract:errors:check` runs in CI and fails if the committed catalog
does not match the contracts, so a new code cannot land undocumented.

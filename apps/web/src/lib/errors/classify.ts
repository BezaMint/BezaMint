/**
 * Condition → catalogue code, for every failure the app observes but does not
 * itself name.
 *
 * Why a table
 * -----------
 * A gateway that refused a connection, a gateway that rate-limited, a gateway
 * that served the wrong bytes, and a gateway that served nothing at all are four
 * different operational problems with four different remedies, and they all
 * arrive here as `fetch` rejecting or a non-200 response. The module that sees
 * the condition knows which one it is; the module that reports the failure needs
 * a code. This file is where the two meet, so the mapping is in one place instead
 * of being re-derived at each `catch`.
 *
 * Every entry is a named condition. A caller passes the condition it observed —
 * `gatewayFailureCode('throttled')` — rather than a number or a sentence, so a
 * new condition cannot be silently mis-mapped to a neighbouring one, and
 * `classify.test.ts` asserts every condition in every table maps to a code that
 * exists in the catalogue.
 *
 * `scripts/check-error-codes.py` fails CI when a declared code is not referenced
 * anywhere. These tables are the reference for the codes below, which is why
 * they are enumerated rather than inlined as string literals at call sites.
 */

import type { AnyErrorCode } from '@bezamint/shared';

// ── IPFS gateways ────────────────────────────────────────────────────────

/** How a gateway read ended. */
export type GatewayFailure =
  | 'unreachable'
  | 'timeout'
  | 'throttled'
  | 'content_missing'
  | 'hash_mismatch'
  | 'not_found'
  | 'all_exhausted';

export const GATEWAY_FAILURE_CODES: Readonly<Record<GatewayFailure, AnyErrorCode>> = {
  unreachable: 'GATEWAY_UNREACHABLE',
  timeout: 'GATEWAY_TIMEOUT',
  throttled: 'GATEWAY_THROTTLED',
  content_missing: 'CONTENT_NOT_FOUND',
  hash_mismatch: 'CONTENT_HASH_MISMATCH',
  not_found: 'CONTENT_NOT_FOUND',
  all_exhausted: 'GATEWAY_FALLBACK_EXHAUSTED',
};

/** Map a gateway failure kind onto the catalogue. */
export const gatewayFailureCode = (kind: GatewayFailure): AnyErrorCode =>
  GATEWAY_FAILURE_CODES[kind];

// ── Pinning ─────────────────────────────────────────────────────────────

/** How an upload to the pinning provider ended. */
export type PinFailure =
  | 'not_configured'
  | 'auth_failed'
  | 'rate_limited'
  | 'upstream_error'
  | 'file_failed'
  | 'json_failed'
  | 'timeout'
  | 'no_cid'
  | 'invalid_cid'
  | 'unsupported_encoding'
  | 'unsupported_multihash'
  | 'digest_mismatch'
  | 'not_propagated';

export const PIN_FAILURE_CODES: Readonly<Record<PinFailure, AnyErrorCode>> = {
  not_configured: 'PINATA_NOT_CONFIGURED',
  auth_failed: 'PINATA_AUTH_FAILED',
  rate_limited: 'PINATA_RATE_LIMITED',
  upstream_error: 'PINATA_UPSTREAM_ERROR',
  file_failed: 'PIN_UPLOAD_FAILED',
  json_failed: 'PIN_JSON_FAILED',
  timeout: 'PIN_TIMEOUT',
  no_cid: 'PIN_CID_MISSING',
  invalid_cid: 'CID_MALFORMED',
  unsupported_encoding: 'CID_ENCODING_UNSUPPORTED',
  unsupported_multihash: 'CID_MULTIHASH_UNSUPPORTED',
  digest_mismatch: 'CID_DIGEST_MISMATCH',
  not_propagated: 'PIN_NOT_PROPAGATED',
};

export const pinFailureCode = (kind: PinFailure): AnyErrorCode => PIN_FAILURE_CODES[kind];

// ── Metadata documents ──────────────────────────────────────────────────

/** How a metadata read or parse ended. */
export type DocumentFailure =
  | 'not_json'
  | 'schema_invalid'
  | 'name_missing'
  | 'image_missing'
  | 'attributes_not_array'
  | 'properties_not_object'
  | 'too_large'
  | 'uri_not_ipfs'
  | 'resolver_timeout'
  | 'redirect_unsafe'
  | 'resolver_status'
  | 'not_found';

export const DOCUMENT_FAILURE_CODES: Readonly<Record<DocumentFailure, AnyErrorCode>> = {
  not_json: 'DOCUMENT_NOT_JSON',
  schema_invalid: 'DOCUMENT_SCHEMA_INVALID',
  name_missing: 'DOCUMENT_NAME_MISSING',
  image_missing: 'DOCUMENT_IMAGE_MISSING',
  attributes_not_array: 'DOCUMENT_ATTRIBUTES_NOT_ARRAY',
  properties_not_object: 'DOCUMENT_PROPERTIES_NOT_OBJECT',
  too_large: 'DOCUMENT_TOO_LARGE',
  uri_not_ipfs: 'URI_NOT_IPFS',
  resolver_timeout: 'RESOLVER_TIMEOUT',
  redirect_unsafe: 'RESOLVER_REDIRECT_UNSAFE',
  resolver_status: 'RESOLVER_STATUS_ERROR',
  not_found: 'TOKEN_METADATA_MISSING',
};

export const documentFailureCode = (kind: DocumentFailure): AnyErrorCode =>
  DOCUMENT_FAILURE_CODES[kind];

// ── Indexer ────────────────────────────────────────────────────────────

/** How a ledger poll or an event decode ended. */
export type IndexerFailure =
  | 'rpc_unreachable'
  | 'rpc_timeout'
  | 'rpc_rejected'
  | 'cursor_invalid'
  | 'cursor_regression'
  | 'decode_failed'
  | 'unknown_topic'
  | 'schema_version'
  | 'poll_failed'
  | 'ledger_range'
  | 'start_ledger'
  | 'snapshot_read'
  | 'snapshot_write'
  | 'contract_ids_incomplete';

export const INDEXER_FAILURE_CODES: Readonly<Record<IndexerFailure, AnyErrorCode>> = {
  rpc_unreachable: 'RPC_UNREACHABLE',
  rpc_timeout: 'RPC_TIMEOUT',
  rpc_rejected: 'RPC_REJECTED',
  cursor_invalid: 'EVENT_CURSOR_INVALID',
  cursor_regression: 'CURSOR_REGRESSION',
  decode_failed: 'EVENT_DECODE_FAILED',
  unknown_topic: 'EVENT_UNKNOWN_TOPIC',
  schema_version: 'EVENT_SCHEMA_VERSION_UNSUPPORTED',
  poll_failed: 'POLL_FAILED',
  ledger_range: 'LEDGER_RANGE_INVALID',
  start_ledger: 'START_LEDGER_MISSING',
  snapshot_read: 'SNAPSHOT_READ_FAILED',
  snapshot_write: 'SNAPSHOT_WRITE_FAILED',
  contract_ids_incomplete: 'CONTRACT_IDS_INCOMPLETE',
};

export const indexerFailureCode = (kind: IndexerFailure): AnyErrorCode =>
  INDEXER_FAILURE_CODES[kind];

// ── Authorization ──────────────────────────────────────────────────────

/** Why a mutating request was refused before its handler ran. */
export type AuthFailure =
  | 'api_key_required'
  | 'api_key_invalid'
  | 'origin_required'
  | 'origin_not_allowed'
  | 'content_type_not_allowed'
  | 'preflight_rejected'
  | 'admin_required';

export const AUTH_FAILURE_CODES: Readonly<Record<AuthFailure, AnyErrorCode>> = {
  api_key_required: 'API_KEY_REQUIRED',
  api_key_invalid: 'API_KEY_INVALID',
  origin_required: 'ORIGIN_REQUIRED',
  origin_not_allowed: 'ORIGIN_NOT_ALLOWED',
  content_type_not_allowed: 'CONTENT_TYPE_NOT_ALLOWED',
  preflight_rejected: 'PREFLIGHT_REJECTED',
  admin_required: 'ADMIN_REQUIRED',
};

export const authFailureCode = (kind: AuthFailure): AnyErrorCode => AUTH_FAILURE_CODES[kind];

// ── Configuration ──────────────────────────────────────────────────────

/** A configuration key that is absent or unusable at boot. */
export type ConfigFailure =
  | 'nft_contract_id'
  | 'collection_contract_id'
  | 'royalty_contract_id'
  | 'creator_contract_id'
  | 'factory_contract_id'
  | 'rpc_url'
  | 'passphrase'
  | 'app_url'
  | 'pinata_jwt'
  | 'write_key'
  | 'contract_id_malformed'
  | 'env_var_malformed'
  | 'gateway_url_invalid'
  | 'network_mismatch';

export const CONFIG_FAILURE_CODES: Readonly<Record<ConfigFailure, AnyErrorCode>> = {
  nft_contract_id: 'NFT_CONTRACT_ID_MISSING',
  collection_contract_id: 'COLLECTION_CONTRACT_ID_MISSING',
  royalty_contract_id: 'ROYALTY_CONTRACT_ID_MISSING',
  creator_contract_id: 'CREATOR_CONTRACT_ID_MISSING',
  factory_contract_id: 'FACTORY_CONTRACT_ID_MISSING',
  rpc_url: 'RPC_URL_MISSING',
  passphrase: 'NETWORK_PASSPHRASE_MISSING',
  app_url: 'APP_URL_MISSING',
  pinata_jwt: 'PINATA_JWT_MISSING',
  write_key: 'WRITE_KEY_MISSING',
  contract_id_malformed: 'CONTRACT_ID_MALFORMED',
  env_var_malformed: 'ENV_VAR_MALFORMED',
  gateway_url_invalid: 'GATEWAY_URL_INVALID',
  network_mismatch: 'NETWORK_MISMATCH',
};

export const configFailureCode = (kind: ConfigFailure): AnyErrorCode => CONFIG_FAILURE_CODES[kind];

// ── Client surfaces ────────────────────────────────────────────────────

/** A failure the browser reports without a server round trip. */
export type ClientFailure =
  | 'boundary'
  | 'route'
  | 'hydration'
  | 'image_load'
  | 'image_fallback'
  | 'clipboard'
  | 'share'
  | 'offline';

export const CLIENT_FAILURE_CODES: Readonly<Record<ClientFailure, AnyErrorCode>> = {
  boundary: 'ERROR_BOUNDARY_CAUGHT',
  route: 'ROUTE_ERROR_CAUGHT',
  hydration: 'HYDRATION_FAILED',
  image_load: 'IMAGE_LOAD_FAILED',
  image_fallback: 'IMAGE_FALLBACK_SHOWN',
  clipboard: 'CLIPBOARD_COPY_FAILED',
  share: 'SHARE_UNSUPPORTED',
  offline: 'OFFLINE',
};

export const clientFailureCode = (kind: ClientFailure): AnyErrorCode => CLIENT_FAILURE_CODES[kind];

/**
 * The BezaMint error catalogue.
 *
 * One identifier per failure the system can produce or surface, so that a client
 * branches on a stable code instead of matching on prose. The catalogue is
 * append-only: ids and names are never reused or renumbered, because a runbook or
 * a client may already depend on them.
 *
 * Adding a code
 * -------------
 * Declare it in the row list for its domain and raise it from the site that can
 * produce it. `scripts/check-error-codes.py` fails CI when a declared code has no
 * call site, which is what keeps this file a description of the system rather
 * than an aspiration.
 *
 * The three origins
 * -----------------
 * - **contract** — the five Soroban contracts. Generated from the
 *   `#[contracterror]` enums into `apps/web/src/lib/contractErrors.ts`; listed
 *   here as a domain for documentation completeness only.
 * - **protocol** — Stellar's own result codes, in `protocol.ts`. Not ours to
 *   invent, and checked against the SDK's enums so the table cannot miss one.
 * - **everything else** — ours: an HTTP outcome, a validation rule, a wallet
 *   refusal, an IPFS failure, an indexer condition, a configuration mistake.
 */

import type { ErrorCodeDefinition, ErrorDomain, ErrorCodeMap } from './types';

/**
 * A row is `[name, httpStatus, message, retryable?]`.
 *
 * Compact on purpose: the catalogue is long, and one line per code keeps it
 * reviewable as a list rather than a screen of object literals. `httpStatus` is
 * `0` when the code is not an HTTP outcome.
 */
type Row = readonly [name: string, status: number, message: string, retryable?: boolean];

const DOMAIN_PREFIX: Readonly<Record<ErrorDomain, string>> = {
  contract: 'CONTRACT',
  protocol: 'PROTOCOL',
  api: 'API',
  auth: 'AUTH',
  validation: 'VALIDATION',
  wallet: 'WALLET',
  transaction: 'TX',
  ipfs: 'IPFS',
  metadata: 'METADATA',
  indexer: 'INDEXER',
  config: 'CONFIG',
  ui: 'UI',
};

/**
 * Domain row lists, in declaration order.
 *
 * Order is significant only in that ids are assigned from it, so a new code is
 * appended to its domain rather than inserted — inserting would renumber every
 * later code in that domain and silently change published identifiers.
 */
export const ERROR_ROWS = {
  // Generated from `contracts/*/src/lib.rs`; see `contractErrors.ts`.
  contract: [],

  // Populated from Stellar's own enums in `protocol.ts` and merged in
  // `index.ts`, so a protocol code is declared exactly where it is classified.
  protocol: [],

  // ── api: HTTP outcomes a route or shared helper returns ────────────────
  api: [
    ['BAD_REQUEST', 400, 'The request could not be understood'],
    ['UNAUTHORIZED', 401, 'Authentication required'],
    ['FORBIDDEN', 403, 'Not allowed'],
    ['NOT_FOUND', 404, 'Not found'],
    ['CONTRACT_ERROR', 422, 'A contract call failed'],
    ['RATE_LIMITED', 429, 'Too many requests'],
    ['INTERNAL', 500, 'Internal server error'],
    // `NETWORK_ERROR` and `TIMEOUT` keep the names the API has always published.
    // Renaming them for tidiness would break every client that branches on
    // `error.code`, which is the one thing the codes exist to prevent.
    ['NETWORK_ERROR', 502, 'An upstream service could not be reached', true],
    ['TIMEOUT', 504, 'An upstream service did not answer in time', true],
    ['COLLECTION_ARCHIVED', 409, 'The collection is archived and rejects new members'],
    ['TOKEN_ALREADY_IN_COLLECTION', 409, 'The token already belongs to a collection'],
    ['CONTRACT_NOT_CONFIGURED', 503, 'A required contract id is not configured'],
    ['INDEXER_UNAVAILABLE', 503, 'The indexer has not produced a usable snapshot yet', true],
  ],

  // ── auth: who the caller is, and what they may do ─────────────────────
  auth: [
    ['API_KEY_REQUIRED', 401, 'This endpoint requires an API key'],
    ['API_KEY_INVALID', 401, 'The supplied API key is not valid'],
    ['ORIGIN_REQUIRED', 403, 'A browser origin is required for this request'],
    ['ORIGIN_NOT_ALLOWED', 403, 'That origin is not allowed to call this endpoint'],
    ['CONTENT_TYPE_NOT_ALLOWED', 415, 'That content type is not accepted here'],
    ['PREFLIGHT_REJECTED', 403, 'The preflight request was refused'],
    ['ADMIN_REQUIRED', 403, 'Only the contract admin may do this'],
  ],

  // ── validation: a rule the input broke ───────────────────────────────
  validation: [
    ['NAME_REQUIRED', 400, 'A name is required'],
    ['NAME_TOO_LONG', 400, 'The name is longer than the limit'],
    ['DESCRIPTION_TOO_LONG', 400, 'The description is longer than the limit'],
    ['DISPLAY_NAME_REQUIRED', 400, 'A display name is required'],
    ['DISPLAY_NAME_TOO_LONG', 400, 'The display name is longer than the limit'],
    ['ADDRESS_REQUIRED', 400, 'A Stellar account address is required'],
    ['ADDRESS_MALFORMED', 400, 'Not a valid Stellar account address'],
    ['PARAMETER_NOT_INTEGER', 400, 'A numeric parameter is not an integer'],
    ['PARAMETER_NEGATIVE', 400, 'A numeric parameter is negative'],
    ['BASIS_POINTS_OUT_OF_RANGE', 400, 'Royalty basis points are outside 0–10000'],
    ['ROYALTY_RECIPIENTS_TOO_MANY', 400, 'More royalty recipients than the contract accepts'],
    ['ROYALTY_SHARE_SUM_INVALID', 400, 'Royalty shares must total exactly 100'],
    ['ROYALTY_SHARE_OUT_OF_RANGE', 400, 'A royalty share is outside 0–100'],
    ['URL_MALFORMED', 400, 'Not a usable absolute URL'],
    ['JSON_BODY_REQUIRED', 400, 'A JSON request body is required'],
    ['JSON_BODY_MALFORMED', 400, 'The request body is not valid JSON'],
  ],

  // ── wallet: the browser wallet refused or could not answer ────────────
  wallet: [
    ['WALLET_NOT_INSTALLED', 0, 'The Freighter browser extension is not installed'],
    ['WALLET_NOT_CONNECTED', 0, 'The wallet is installed but not connected to a site'],
    ['WALLET_ACCESS_DENIED', 0, 'The wallet refused this site access to the account'],
    ['WALLET_REQUEST_TIMEOUT', 0, 'The wallet did not answer before the request timed out', true],
    ['WALLET_USER_REJECTED', 0, 'The request was rejected in the wallet'],
    ['WALLET_WRONG_NETWORK', 0, 'The wallet is on a different network than the app'],
    ['WALLET_ACCOUNT_CHANGED', 0, 'The wallet account changed during the flow'],
    ['WALLET_UNSUPPORTED_METHOD', 0, 'The wallet does not implement this method'],
    ['WALLET_BRIDGE_ERROR', 0, 'The wallet extension returned an unusable response'],
    ['WALLET_POPUP_BLOCKED', 0, 'The wallet window was blocked by the browser'],
  ],

  // ── transaction: building, signing, submitting, confirming ───────────
  transaction: [
    ['TX_AUTH_ENTRY_MISSING', 403, 'Simulation asked for an authorization that was not signed'],
    ['TX_CONFIRMATION_TIMEOUT', 504, 'The transaction was not confirmed before the deadline', true],
    ['TX_RESULT_FAILED', 422, 'The transaction was included but failed'],
    ['TX_INCLUSION_MISSING', 502, 'The transaction was submitted but never included', true],
    ['TX_SIGNING_FAILED', 0, 'The wallet could not sign the transaction'],
    ['TX_XDR_MALFORMED', 400, 'The transaction envelope is not valid base64 XDR'],
    ['TX_FEE_UNPAYABLE', 400, 'The source account cannot pay the transaction fee'],
    [
      'TX_RESOURCE_BUDGET_INSUFFICIENT',
      409,
      'The declared resource budget is below what the call needs',
      true,
    ],
  ],

  // ── ipfs: pinning and gateway reads ──────────────────────────────────
  ipfs: [
    ['PINATA_NOT_CONFIGURED', 503, 'No Pinata credential is configured'],
    ['PINATA_AUTH_FAILED', 401, 'Pinata rejected the credential'],
    ['PINATA_RATE_LIMITED', 429, 'Pinata is rate limiting this deployment', true],
    ['PINATA_UPSTREAM_ERROR', 502, 'Pinata returned an error', true],
    ['PIN_UPLOAD_FAILED', 502, 'The file could not be pinned'],
    ['PIN_JSON_FAILED', 502, 'The JSON document could not be pinned'],
    ['PIN_TIMEOUT', 504, 'Pinning did not complete before the deadline', true],
    ['PIN_CID_MISSING', 502, 'The pin response carried no CID'],
    ['GATEWAY_UNREACHABLE', 502, 'No configured gateway could be reached', true],
    ['GATEWAY_THROTTLED', 429, 'Every configured gateway refused the request', true],
    ['GATEWAY_TIMEOUT', 504, 'The gateway did not answer before the deadline', true],
    ['CONTENT_NOT_FOUND', 404, 'The gateway has no content for that CID'],
    ['CONTENT_HASH_MISMATCH', 502, 'The gateway returned content that does not match the CID'],
    ['CID_MALFORMED', 400, 'Not a valid CID'],
    ['CID_ENCODING_UNSUPPORTED', 400, 'That CID uses a base encoding this app does not handle'],
    ['CID_MULTIHASH_UNSUPPORTED', 400, 'That CID uses a hash function this app does not handle'],
    ['CID_DIGEST_MISMATCH', 502, 'The CID digest does not match the bytes it names'],
    ['PIN_NOT_PROPAGATED', 409, 'The pin succeeded but the content is not reachable yet', true],
    ['GATEWAY_FALLBACK_EXHAUSTED', 502, 'Every configured gateway was tried and refused', true],
  ],

  // ── metadata: resolving and validating a metadata document ───────────
  metadata: [
    ['DOCUMENT_NOT_JSON', 502, 'The metadata document is not JSON'],
    ['DOCUMENT_SCHEMA_INVALID', 422, 'The metadata document does not match the expected shape'],
    ['DOCUMENT_NAME_MISSING', 422, 'The metadata document carries no name'],
    ['DOCUMENT_IMAGE_MISSING', 422, 'The metadata document carries no image'],
    ['DOCUMENT_ATTRIBUTES_NOT_ARRAY', 422, 'The metadata document attributes are not a list'],
    ['DOCUMENT_PROPERTIES_NOT_OBJECT', 422, 'The metadata document properties are not an object'],
    ['DOCUMENT_TOO_LARGE', 413, 'The metadata document is larger than the accepted limit'],
    ['URI_NOT_IPFS', 400, 'The URI is not an IPFS URI, so it has no CID to resolve'],
    ['RESOLVER_TIMEOUT', 504, 'Metadata resolution timed out', true],
    ['RESOLVER_REDIRECT_UNSAFE', 400, 'Metadata resolution was redirected somewhere not allowed'],
    ['RESOLVER_STATUS_ERROR', 502, 'Metadata resolution returned a failing status', true],
    ['TOKEN_METADATA_MISSING', 404, 'No metadata could be resolved for that token'],
  ],

  // ── indexer: reading the chain into a snapshot ───────────────────────
  indexer: [
    ['RPC_UNREACHABLE', 502, 'The Soroban RPC endpoint could not be reached', true],
    ['RPC_TIMEOUT', 504, 'The Soroban RPC endpoint did not answer in time', true],
    ['RPC_REJECTED', 502, 'The Soroban RPC endpoint rejected the request'],
    ['EVENT_CURSOR_INVALID', 500, 'The stored event cursor is not usable'],
    ['CURSOR_REGRESSION', 500, 'The event cursor moved backwards'],
    ['EVENT_DECODE_FAILED', 500, 'An event payload could not be decoded'],
    ['EVENT_UNKNOWN_TOPIC', 500, 'An event carries a topic the indexer does not know'],
    ['EVENT_SCHEMA_VERSION_UNSUPPORTED', 500, 'An event uses an unsupported schema version'],
    ['POLL_FAILED', 502, 'A ledger poll failed', true],
    ['LEDGER_RANGE_INVALID', 500, 'The requested ledger range is not usable'],
    ['START_LEDGER_MISSING', 500, 'The indexer could not determine where to start'],
    ['SNAPSHOT_READ_FAILED', 500, 'The cached index snapshot could not be read'],
    ['SNAPSHOT_WRITE_FAILED', 500, 'The index snapshot could not be persisted'],
    ['CONTRACT_IDS_INCOMPLETE', 503, 'The indexer is missing one or more contract ids'],
  ],

  // ── config: a deployment or build is misconfigured ───────────────────
  config: [
    ['NFT_CONTRACT_ID_MISSING', 503, 'NEXT_PUBLIC_NFT_CONTRACT_ID is not set'],
    ['COLLECTION_CONTRACT_ID_MISSING', 503, 'NEXT_PUBLIC_COLLECTION_CONTRACT_ID is not set'],
    ['ROYALTY_CONTRACT_ID_MISSING', 503, 'NEXT_PUBLIC_ROYALTY_CONTRACT_ID is not set'],
    ['CREATOR_CONTRACT_ID_MISSING', 503, 'NEXT_PUBLIC_CREATOR_CONTRACT_ID is not set'],
    ['FACTORY_CONTRACT_ID_MISSING', 503, 'NEXT_PUBLIC_FACTORY_CONTRACT_ID is not set'],
    ['RPC_URL_MISSING', 503, 'NEXT_PUBLIC_STELLAR_RPC_URL is not set'],
    ['NETWORK_PASSPHRASE_MISSING', 503, 'NEXT_PUBLIC_STELLAR_PASSPHRASE is not set'],
    ['APP_URL_MISSING', 503, 'NEXT_PUBLIC_APP_URL is not set'],
    [
      'PINATA_JWT_MISSING',
      503,
      'PINATA_JWT is not set, so pinning falls back to a placeholder URI',
    ],
    ['WRITE_KEY_MISSING', 500, 'API_WRITE_KEY is not set in a production deployment'],
    ['CONTRACT_ID_MALFORMED', 500, 'A configured contract id is not a valid contract address'],
    ['ENV_VAR_MALFORMED', 500, 'An environment variable has an unexpected shape'],
    ['GATEWAY_URL_INVALID', 500, 'The configured IPFS gateway is not a usable http(s) URL'],
    ['NETWORK_MISMATCH', 500, 'The configured network and RPC endpoint do not agree'],
  ],

  // ── ui: a client-side failure the error boundary or a component caught ─
  ui: [
    ['ERROR_BOUNDARY_CAUGHT', 0, 'A component tree threw and the error boundary caught it'],
    ['ROUTE_ERROR_CAUGHT', 0, 'A route segment threw and the error page caught it'],
    ['HYDRATION_FAILED', 0, 'The server-rendered markup did not match the client render'],
    ['IMAGE_LOAD_FAILED', 0, 'An image could not be loaded from its gateway'],
    ['IMAGE_FALLBACK_SHOWN', 0, 'An image failed and a placeholder was shown instead'],
    ['CLIPBOARD_COPY_FAILED', 0, 'The browser refused access to the clipboard'],
    ['SHARE_UNSUPPORTED', 0, 'This browser does not implement the share sheet'],
    ['OFFLINE', 0, 'The browser reports no network connection', true],
  ],
} as const satisfies Readonly<Record<ErrorDomain, readonly Row[]>>;

/** `BM-<DOMAIN>-<NNNN>`, four digits, one-based, per domain. */
function makeId(domain: ErrorDomain, index: number): string {
  return `BM-${DOMAIN_PREFIX[domain]}-${String(index + 1).padStart(4, '0')}`;
}

/**
 * Build the catalogue from the row lists.
 *
 * `extra` lets a sibling module contribute entries whose declarations live with
 * their classification logic — the Stellar protocol table in `protocol.ts` does
 * exactly that, so a protocol code is defined next to the result code it
 * decodes rather than in two places.
 */
export function buildCatalogue(
  extra: Partial<Record<ErrorDomain, readonly ErrorCodeDefinition[]>> = {},
): readonly ErrorCodeDefinition[] {
  const out: ErrorCodeDefinition[] = [];

  for (const domain of Object.keys(ERROR_ROWS) as ErrorDomain[]) {
    const rows = ERROR_ROWS[domain] as readonly Row[];
    rows.forEach((row, index) => {
      const [name, status, message, retryable = false] = row;
      out.push({ id: makeId(domain, index), name, domain, status, message, retryable });
    });
    out.push(...(extra[domain] ?? []));
  }

  return out;
}

/** The catalogue, keyed by name. */
export function indexCatalogue(codes: readonly ErrorCodeDefinition[]): ErrorCodeMap {
  const map: Record<string, ErrorCodeDefinition> = {};
  for (const code of codes) map[code.name] = code;
  return Object.freeze(map);
}

/**
 * A symbolic name from a domain that has rows in [`ERROR_ROWS`].
 *
 * Deriving this from the rows rather than writing a union by hand means a name
 * that is not in the catalogue fails to type-check at the call site, which is
 * the cheapest possible place to catch a typo'd code.
 */
export type DeclaredErrorCode = {
  [D in Exclude<ErrorDomain, 'contract' | 'protocol'>]: (typeof ERROR_ROWS)[D][number][0];
}[Exclude<ErrorDomain, 'contract' | 'protocol'>];

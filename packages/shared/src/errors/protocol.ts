/**
 * Stellar's own failure codes, and what each one means to a user.
 *
 * A rejected transaction does not arrive as a message. It arrives as a
 * `result_codes` object — `{ transaction: 'tx_bad_seq' }`, or
 * `{ transaction: 'tx_failed', operations: ['op_underfunded'] }` — and, for an
 * invoked contract, as a host error inside the diagnostic event stream. None of
 * those strings is ours to invent or rename, so this module does not define a new
 * taxonomy: it is the mapping from the protocol's vocabulary onto the catalogue
 * in `codes.ts`, one entry per failure a user can actually be shown.
 *
 * The mapping lives in shared code because both sides need it. The API
 * normalizes a submission failure into `details.stellar`, and the browser turns
 * the same object into the sentence under the button.
 *
 * ## Why the table is checked rather than trusted
 *
 * A hand-written mapping rots silently: protocol 21 added `txBadMinSeqAgeOrGap`,
 * and a table written for protocol 20 would classify it as "unknown" forever with
 * no signal. `PROTOCOL_ENUM_MEMBERS` lists the SDK enums this table claims to
 * cover, and `errors.test.ts` asserts that every member of every listed enum is
 * either classified below or explicitly ignored — so a SDK upgrade that adds a
 * result code fails the suite instead of quietly degrading a diagnosis.
 */

import type { ErrorCodeDefinition } from './types';

/** Where a protocol code is read from. */
export interface ProtocolRow {
  /** Catalogue name, declared here and contributed to the catalogue. */
  readonly name: string;
  /** HTTP status a server should surface, or `0` when it is client-side only. */
  readonly status: number;
  /** Whether re-submitting could plausibly succeed. */
  readonly retryable: boolean;
  /** What to tell the user. */
  readonly message: string;
  /**
   * SDK enum member names this row classifies. Empty for the host-error rows,
   * which are matched by pattern because the host reports them as text inside a
   * diagnostic event rather than as an enum value.
   */
  readonly members?: readonly string[];
  /** Message patterns for host-level failures. */
  readonly patterns?: readonly string[];
  /**
   * Extra result-code spellings this row also answers to.
   *
   * The same failure is named twice in the ecosystem: the SDK's enum calls it
   * `paymentUnderfunded`, and Horizon's `result_codes.operations` calls it
   * `op_underfunded`. A mapping that knew only one spelling classified the other
   * as unknown, so both are listed.
   */
  readonly aliases?: readonly string[];
}

/**
 * Every row, in declaration order. Ids are assigned from this order, so rows are
 * appended rather than inserted.
 */
export const PROTOCOL_ROWS = [
  // ── Transaction result codes ─────────────────────────────────────────
  {
    name: 'TX_REJECTED_BY_NETWORK',
    status: 422,
    retryable: false,
    message: 'The network rejected the transaction',
    members: ['txFailed'],
  },
  {
    name: 'TX_SUBMITTED_TOO_EARLY',
    status: 409,
    retryable: true,
    message: 'The transaction is not valid yet; the time bounds start later',
    members: ['txTooEarly'],
  },
  {
    name: 'TX_SUBMITTED_TOO_LATE',
    status: 409,
    retryable: false,
    message: 'The transaction time bounds have expired',
    members: ['txTooLate'],
  },
  {
    name: 'TX_MISSING_OPERATION',
    status: 400,
    retryable: false,
    message: 'The transaction carries no operation',
    members: ['txMissingOperation'],
  },
  {
    name: 'TX_SEQUENCE_STALE',
    status: 409,
    retryable: true,
    message: 'The account sequence number is out of date; refresh and try again',
    members: ['txBadSeq'],
  },
  {
    name: 'TX_SIGNATURE_INVALID',
    status: 403,
    retryable: false,
    message: 'The transaction signature does not match the source account',
    members: ['txBadAuth'],
  },
  {
    name: 'TX_INSUFFICIENT_BALANCE',
    status: 400,
    retryable: false,
    message: 'The source account does not hold enough XLM to pay for this',
    members: ['txInsufficientBalance'],
  },
  {
    name: 'TX_SOURCE_ACCOUNT_MISSING',
    status: 400,
    retryable: false,
    message: 'The source account is not funded on this network',
    members: ['txNoAccount'],
  },
  {
    name: 'TX_FEE_TOO_LOW',
    status: 409,
    retryable: true,
    message: 'The offered fee is below the network minimum',
    members: ['txInsufficientFee'],
  },
  {
    name: 'TX_SIGNED_BY_UNEXPECTED_ACCOUNT',
    status: 403,
    retryable: false,
    message: 'The transaction carries a signature it should not',
    members: ['txBadAuthExtra'],
  },
  {
    name: 'TX_NETWORK_INTERNAL_ERROR',
    status: 502,
    retryable: true,
    message: 'The network reported an internal error; retry shortly',
    members: ['txInternalError'],
  },
  {
    name: 'TX_NOT_SUPPORTED_BY_NETWORK',
    status: 422,
    retryable: false,
    message: 'This network does not support the requested transaction',
    members: ['txNotSupported'],
  },
  {
    name: 'TX_FEE_BUMP_INNER_FAILED',
    status: 422,
    retryable: false,
    message: 'The inner transaction of the fee bump failed',
    members: ['txFeeBumpInnerFailed'],
  },
  {
    name: 'TX_SPONSORSHIP_INVALID',
    status: 422,
    retryable: false,
    message: 'The transaction breaks sponsorship rules',
    members: ['txBadSponsorship'],
  },
  {
    name: 'TX_MIN_SEQUENCE_AGE_OR_GAP',
    status: 409,
    retryable: false,
    message: 'The transaction does not satisfy the account minimum sequence age or gap',
    members: ['txBadMinSeqAgeOrGap'],
  },
  {
    name: 'TX_MALFORMED_ENVELOPE',
    status: 400,
    retryable: false,
    message: 'The transaction envelope is malformed',
    members: ['txMalformed'],
  },
  {
    name: 'TX_SOROBAN_INVALID',
    status: 422,
    retryable: false,
    message: 'The Soroban part of the transaction is invalid',
    members: ['txSorobanInvalid'],
  },

  // ── Operation result codes ───────────────────────────────────────────
  {
    name: 'OP_SIGNATURE_INVALID',
    status: 403,
    retryable: false,
    message: 'An operation signature does not match the account it claims',
    members: ['opBadAuth'],
  },
  {
    name: 'OP_ACCOUNT_MISSING',
    status: 400,
    retryable: false,
    message: 'An account an operation refers to does not exist',
    members: ['opNoAccount'],
  },
  {
    name: 'OP_NOT_SUPPORTED',
    status: 422,
    retryable: false,
    message: 'An operation in this transaction is not supported here',
    members: ['opNotSupported'],
  },
  {
    name: 'OP_TOO_MANY_SUBENTRIES',
    status: 422,
    retryable: false,
    message: 'The transaction would exceed the account subentry limit',
    members: ['opTooManySubentries'],
  },
  {
    name: 'OP_EXCEEDED_WORK_LIMIT',
    status: 429,
    retryable: true,
    message: 'The transaction exceeded the compute work limit',
    members: ['opExceededWorkLimit'],
  },
  {
    name: 'OP_TOO_MANY_SPONSORING',
    status: 422,
    retryable: false,
    message: 'The transaction exceeds the sponsorship limit',
    members: ['opTooManySponsoring'],
  },

  // ── Host function result codes (the Soroban invocation itself) ────────
  {
    name: 'HOST_FUNCTION_MALFORMED',
    status: 400,
    retryable: false,
    message: 'The contract invocation is malformed',
    members: ['invokeHostFunctionMalformed'],
  },
  {
    name: 'HOST_FUNCTION_TRAPPED',
    status: 422,
    retryable: false,
    message: 'The contract trapped; its state was not changed',
    members: ['invokeHostFunctionTrapped'],
  },
  {
    name: 'HOST_RESOURCE_LIMIT_EXCEEDED',
    status: 429,
    retryable: false,
    message: 'The invocation exceeded the resource limit',
    members: ['invokeHostFunctionResourceLimitExceeded'],
  },
  {
    name: 'HOST_ENTRY_ARCHIVED',
    status: 409,
    retryable: true,
    message: 'A ledger entry the call needs has been archived and must be restored',
    members: ['invokeHostFunctionEntryArchived'],
  },
  {
    name: 'HOST_REFUNDABLE_FEE_INSUFFICIENT',
    status: 409,
    retryable: true,
    message: 'The refundable fee is too low for the resources the call needs',
    members: ['invokeHostFunctionInsufficientRefundableFee'],
  },

  // ── Payment result codes ─────────────────────────────────────────────
  // The app moves no value itself, but a user's wallet can, and the wallet
  // surfaces the same failure through this code path. `op_underfunded` is
  // aliased from the payment row rather than given its own, because Horizon uses
  // one string for both `payment` and `create_account`; the platform never
  // creates accounts, so the payment meaning is the one a user here can meet.
  {
    name: 'PAYMENT_MALFORMED',
    status: 400,
    retryable: false,
    message: 'The payment operation is malformed',
    members: ['paymentMalformed'],
    aliases: ['op_malformed'],
  },
  {
    name: 'PAYMENT_UNDERFUNDED',
    status: 400,
    retryable: false,
    message: 'The source account does not hold enough of this asset',
    members: ['paymentUnderfunded'],
    aliases: ['op_underfunded'],
  },
  {
    name: 'PAYMENT_SOURCE_NO_TRUST',
    status: 400,
    retryable: false,
    message: 'The source account has no trustline for this asset',
    members: ['paymentSrcNoTrust'],
    aliases: ['op_src_no_trust'],
  },
  {
    name: 'PAYMENT_SOURCE_NOT_AUTHORIZED',
    status: 403,
    retryable: false,
    message: 'The source account is not authorized to hold this asset',
    members: ['paymentSrcNotAuthorized'],
    aliases: ['op_src_not_authorized'],
  },
  {
    name: 'PAYMENT_NO_DESTINATION',
    status: 400,
    retryable: false,
    message: 'The destination account does not exist',
    members: ['paymentNoDestination'],
    aliases: ['op_no_destination'],
  },
  {
    name: 'PAYMENT_NO_TRUST',
    status: 400,
    retryable: false,
    message: 'The destination account has no trustline for this asset',
    members: ['paymentNoTrust'],
    aliases: ['op_no_trust'],
  },
  {
    name: 'PAYMENT_NOT_AUTHORIZED',
    status: 403,
    retryable: false,
    message: 'The destination account is not authorized to hold this asset',
    members: ['paymentNotAuthorized'],
    aliases: ['op_not_authorized'],
  },
  {
    name: 'PAYMENT_LINE_FULL',
    status: 409,
    retryable: false,
    message: 'The destination trustline cannot hold this much of the asset',
    members: ['paymentLineFull'],
    aliases: ['op_line_full'],
  },
  {
    name: 'PAYMENT_NO_ISSUER',
    status: 400,
    retryable: false,
    message: 'The asset has no issuer on this network',
    members: ['paymentNoIssuer'],
    aliases: ['op_no_issuer'],
  },

  // ── Host error families, matched by pattern ──────────────────────────
  // The host reports these inside a diagnostic event as
  // `HostError: Error(<Category>, <Name>)`, so they are text rather than an
  // enum value and cannot be enumerated from the SDK.
  {
    name: 'HOST_AUTH_FAILED',
    status: 403,
    retryable: false,
    message: 'The contract required an authorization that the transaction did not carry',
    patterns: ['Error(Auth, InvalidAction)', 'Error(Auth, ExistingValue)', 'Unauthorized'],
  },
  {
    name: 'HOST_BUDGET_EXCEEDED',
    status: 429,
    retryable: false,
    message: 'The invocation ran out of CPU or memory budget',
    patterns: ['Error(Budget, ExceededLimit)'],
  },
  {
    name: 'HOST_STORAGE_ENTRY_LIMIT',
    status: 422,
    retryable: false,
    message: 'The invocation would exceed the ledger entry limit',
    patterns: ['Error(Storage, ExceededLimit)'],
  },
  {
    name: 'HOST_WASM_INVALID',
    status: 500,
    retryable: false,
    message: 'The contract wasm could not be executed',
    patterns: ['Error(WasmVm'],
  },
  {
    name: 'HOST_TTL_EXPIRED',
    status: 409,
    retryable: true,
    message: 'A ledger entry reached the end of its time to live',
    patterns: ['Error(Storage, MissingValue)', 'Error(Storage, LiveUntilLedgerSeq'],
  },
  {
    name: 'HOST_CONTEXT_INVALID',
    status: 500,
    retryable: false,
    message: 'The host rejected the invocation context',
    patterns: ['Error(Context, '],
  },
] as const satisfies readonly ProtocolRow[];

/**
 * The name of a protocol code, as a literal union.
 *
 * Derived from the table rather than written out, so a row cannot exist that the
 * type does not know about.
 */
export type ProtocolErrorCode = (typeof PROTOCOL_ROWS)[number]['name'];

/**
 * SDK enum members that are deliberately not classified, with the reason.
 *
 * These are successes, or states that only exist inside a fee-bump envelope
 * whose outcome is reported by the outer transaction. Listing them explicitly is
 * what makes the coverage test meaningful: a member is either classified or
 * named here, never silently missed.
 */
export const IGNORED_PROTOCOL_MEMBERS: Readonly<Record<string, string>> = {
  txSuccess: 'success, not a failure',
  opInner: 'success, not a failure',
  invokeHostFunctionSuccess: 'success, not a failure',
  txFeeBumpInnerSuccess: 'inner-transaction success inside a fee bump',
  paymentSuccess: 'success, not a failure',
};

/** The SDK enums the coverage test holds this table to. */
export const PROTOCOL_ENUM_MEMBERS: Readonly<Record<string, readonly string[]>> = {
  TransactionResultCode: [
    'txFeeBumpInnerSuccess',
    'txSuccess',
    'txFailed',
    'txTooEarly',
    'txTooLate',
    'txMissingOperation',
    'txBadSeq',
    'txBadAuth',
    'txInsufficientBalance',
    'txNoAccount',
    'txInsufficientFee',
    'txBadAuthExtra',
    'txInternalError',
    'txNotSupported',
    'txFeeBumpInnerFailed',
    'txBadSponsorship',
    'txBadMinSeqAgeOrGap',
    'txMalformed',
    'txSorobanInvalid',
  ],
  OperationResultCode: [
    'opInner',
    'opBadAuth',
    'opNoAccount',
    'opNotSupported',
    'opTooManySubentries',
    'opExceededWorkLimit',
    'opTooManySponsoring',
  ],
  InvokeHostFunctionResultCode: [
    'invokeHostFunctionSuccess',
    'invokeHostFunctionMalformed',
    'invokeHostFunctionTrapped',
    'invokeHostFunctionResourceLimitExceeded',
    'invokeHostFunctionEntryArchived',
    'invokeHostFunctionInsufficientRefundableFee',
  ],
  PaymentResultCode: [
    'paymentSuccess',
    'paymentMalformed',
    'paymentUnderfunded',
    'paymentSrcNoTrust',
    'paymentSrcNotAuthorized',
    'paymentNoDestination',
    'paymentNoTrust',
    'paymentNotAuthorized',
    'paymentLineFull',
    'paymentNoIssuer',
  ],
};

/**
 * A protocol error in the `snake_case` spelling Horizon and the RPC use.
 *
 * `result_codes` values are snake_case (`tx_bad_seq`); SDK enum members are
 * camelCase (`txBadSeq`). Both spellings resolve to the same row, because the
 * server sees one and the browser sees the other.
 */
const snake = (camel: string): string =>
  camel
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

/** Lookup from either spelling to a row. */
export const PROTOCOL_BY_RESULT: Readonly<Record<string, ProtocolRow>> = (() => {
  const map: Record<string, ProtocolRow> = {};
  // Widened to the interface: the `as const` rows carry literal types, and the
  // lookups below read the optional fields that make a row a member row or a
  // pattern row.
  for (const row of PROTOCOL_ROWS as readonly ProtocolRow[]) {
    for (const member of row.members ?? []) {
      map[member] = row;
      map[snake(member)] = row;
    }
    for (const alias of row.aliases ?? []) map[alias] = row;
  }
  return Object.freeze(map);
})();

/** Lookup from a host-error pattern to a row, longest pattern first. */
export const PROTOCOL_HOST_PATTERNS: readonly (readonly [string, ProtocolRow])[] = (() => {
  const pairs: [string, ProtocolRow][] = [];
  for (const row of PROTOCOL_ROWS as readonly ProtocolRow[]) {
    for (const pattern of row.patterns ?? []) pairs.push([pattern, row]);
  }
  // Longest first, so `Error(Auth, InvalidAction)` is preferred over a shorter
  // pattern that happens to be a prefix of it.
  return Object.freeze(pairs.sort((a, b) => b[0].length - a[0].length));
})();

/** The protocol rows as catalogue entries, ids assigned in declaration order. */
export const PROTOCOL_CODES: readonly ErrorCodeDefinition[] = PROTOCOL_ROWS.map((row, index) => ({
  id: `BM-PROTOCOL-${String(index + 1).padStart(4, '0')}`,
  name: row.name,
  domain: 'protocol' as const,
  status: row.status,
  message: row.message,
  retryable: row.retryable,
}));

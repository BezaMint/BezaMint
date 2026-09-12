/**
 * The public surface of the error catalogue.
 *
 * `ERROR_CODES` is the single source of truth: the docs page, the protocol
 * classifier and the API error class all read it, so a code cannot be documented
 * one way and raised another.
 */

import { buildCatalogue, indexCatalogue, type DeclaredErrorCode } from './codes';
import {
  IGNORED_PROTOCOL_MEMBERS,
  PROTOCOL_BY_RESULT,
  PROTOCOL_CODES,
  PROTOCOL_ENUM_MEMBERS,
  PROTOCOL_HOST_PATTERNS,
  PROTOCOL_ROWS,
  type ProtocolErrorCode,
  type ProtocolRow,
} from './protocol';
import type { ErrorCodeDefinition, ErrorCodeMap, ErrorDomain } from './types';

export type {
  ErrorCodeDefinition,
  ErrorCodeMap,
  ErrorDomain,
  DeclaredErrorCode,
  ProtocolErrorCode,
};

/**
 * Any name the catalogue can resolve.
 *
 * `DeclaredErrorCode` covers the hand-authored domains; protocol codes come from
 * Stellar's own tables. Call sites that can hold either — a transaction error
 * raised from a wallet refusal or from a network result — take this.
 */
export type AnyErrorCode = DeclaredErrorCode | ProtocolErrorCode;
export { ERROR_ROWS } from './codes';
export {
  PROTOCOL_BY_RESULT,
  PROTOCOL_CODES,
  PROTOCOL_ENUM_MEMBERS,
  PROTOCOL_HOST_PATTERNS,
  PROTOCOL_ROWS,
  IGNORED_PROTOCOL_MEMBERS,
  type ProtocolRow,
} from './protocol';

/** Every code in the catalogue. */
export const ERROR_CODES: readonly ErrorCodeDefinition[] = Object.freeze(
  buildCatalogue({ protocol: PROTOCOL_CODES }),
);

/** The catalogue keyed by name, for O(1) lookup. */
export const ERROR_CODE_BY_NAME: ErrorCodeMap = indexCatalogue(ERROR_CODES);

/** The catalogue grouped by domain, in declaration order. */
export const ERROR_CODES_BY_DOMAIN: Readonly<Record<ErrorDomain, readonly ErrorCodeDefinition[]>> =
  (() => {
    const grouped = {} as Record<ErrorDomain, ErrorCodeDefinition[]>;
    for (const code of ERROR_CODES) (grouped[code.domain] ??= []).push(code);
    for (const key of Object.keys(grouped) as ErrorDomain[]) Object.freeze(grouped[key]);
    return Object.freeze(grouped);
  })();

/** Look a code up by name. Returns `undefined` for an unknown name. */
export function getErrorCode(name: string): ErrorCodeDefinition | undefined {
  return ERROR_CODE_BY_NAME[name];
}

/** True when `name` is in the catalogue. */
export function isErrorCode(name: string): boolean {
  return name in ERROR_CODE_BY_NAME;
}

/** What a classified upstream failure looks like. */
export interface ClassifiedError {
  /** The catalogue entry this failure maps to. */
  readonly definition: ErrorCodeDefinition;
  /** The protocol row that matched, when the match came from the protocol table. */
  readonly row: ProtocolRow | null;
  /** The raw token that matched — a result code or a host error fragment. */
  readonly matched: string | null;
}

/**
 * A Stellar submission failure, as Horizon and the RPC report it.
 *
 * Both spellings are accepted: the server sees snake_case result codes, and a
 * client that inspected the SDK enums sees camelCase members.
 */
export interface ProtocolFailureInput {
  /** `result_codes.transaction`, e.g. `tx_bad_seq` or `txBadSeq`. */
  readonly transaction?: string | null;
  /** `result_codes.operations`, in order. */
  readonly operations?: readonly string[] | null;
  /** Free text — a host error, a diagnostic event, an RPC message. */
  readonly message?: string | null;
}

/**
 * Map a Stellar failure onto the catalogue.
 *
 * Order matters, and it is the order a user cares about:
 *
 * 1. **Operations before the transaction.** A transaction result of `tx_failed`
 *    says only "something substantive failed"; the operation result says which.
 *    The earlier implementation reported `tx_failed` and threw away the useful
 *    half, which is how an underfunded payment came to be described as "the
 *    network rejected the transaction".
 * 2. **Then the transaction result.**
 * 3. **Then host error patterns**, which appear in the message rather than in
 *    `result_codes`.
 *
 * Returns `null` when nothing matches, so a caller can fall back to its own
 * generic handling instead of being handed a wrong-but-specific code.
 */
export function classifyProtocolError(input: ProtocolFailureInput): ClassifiedError | null {
  for (const op of input.operations ?? []) {
    const row = PROTOCOL_BY_RESULT[op];
    if (row) {
      const definition = ERROR_CODE_BY_NAME[row.name];
      if (definition) return { definition, row, matched: op };
    }
  }

  if (input.transaction) {
    const row = PROTOCOL_BY_RESULT[input.transaction];
    if (row) {
      const definition = ERROR_CODE_BY_NAME[row.name];
      if (definition) return { definition, row, matched: input.transaction };
    }
  }

  const message = input.message ?? '';
  if (message) {
    for (const [pattern, row] of PROTOCOL_HOST_PATTERNS) {
      if (message.includes(pattern)) {
        const definition = ERROR_CODE_BY_NAME[row.name];
        if (definition) return { definition, row, matched: pattern };
      }
    }
  }

  return null;
}

/**
 * The `BM-…` id for a name, or `null` when the name is not in the catalogue.
 *
 * Ids are what an operator greps a log for and what a monitoring alert fires on;
 * names are what a client branches on. Both are stable, and both are published.
 */
export function errorIdFor(name: DeclaredErrorCode | string): string | null {
  return ERROR_CODE_BY_NAME[name]?.id ?? null;
}

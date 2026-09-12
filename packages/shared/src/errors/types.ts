/**
 * The shape of the project's error catalogue.
 *
 * Why this exists
 * ---------------
 * Failures used to be identified by whichever string a call site happened to
 * write, so `error.code` was one of nine coarse buckets and a client could not
 * tell "the RPC was slow" from "the contract said the collection is archived"
 * without matching on prose. Prose changes; codes do not.
 *
 * Every failure the system can produce or surface now has one immutable
 * identifier, one owning domain and one default message. The catalogue is
 * append-only: an id, once published, is never reused or renumbered, because a
 * client or an operator's runbook may already be branching on it.
 *
 * The catalogue is split by origin, and the distinction matters:
 *
 * - `contract` codes come from the five Soroban contracts and are generated from
 *   the `#[contracterror]` enums, not written here.
 * - `protocol` codes come from Stellar itself — transaction, operation and host
 *   function result codes. They are not ours to invent, and the set is checked
 *   against the SDK's own enums so it cannot silently miss one.
 * - every other domain is ours: an HTTP outcome, a validation rule, a wallet
 *   refusal, an IPFS failure, an indexer condition, a configuration mistake.
 */

/** Where a failure originates. Used to group the catalogue and its docs. */
export type ErrorDomain =
  | 'contract'
  | 'protocol'
  | 'api'
  | 'auth'
  | 'validation'
  | 'wallet'
  | 'transaction'
  | 'ipfs'
  | 'metadata'
  | 'indexer'
  | 'config'
  | 'ui';

/** One entry in the catalogue. */
export interface ErrorCodeDefinition {
  /** Stable identifier, `BM-<DOMAIN>-<NNNN>`. Never reused. */
  readonly id: string;
  /**
   * Stable symbolic name. This is the value that appears as `error.code` in an
   * API response and as the constant a call site raises, so it is what a client
   * branches on.
   */
  readonly name: string;
  /** Owning domain. */
  readonly domain: ErrorDomain;
  /**
   * HTTP status an API handler should answer with, or `0` when the code is not
   * an HTTP outcome (a wallet refusal, a build failure).
   */
  readonly status: number;
  /** Default human-readable message. Call sites may specialise it. */
  readonly message: string;
  /**
   * Whether retrying the same request could plausibly succeed. Drives client
   * back-off and, in the UI, whether the failure is offered as "try again"
   * rather than "fix your input".
   */
  readonly retryable: boolean;
}

/** The catalogue keyed by [`ErrorCodeDefinition.name`]. */
export type ErrorCodeMap = Readonly<Record<string, ErrorCodeDefinition>>;

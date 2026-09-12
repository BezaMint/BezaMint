/**
 * Central error normalization for API routes.
 *
 * Soroban RPC and Horizon failures surface as a tangle of library-specific
 * error shapes (JSON-RPC errors, Axios errors, XDR parse errors, contract
 * panics). This module maps them onto a small set of typed API errors with
 * stable codes + HTTP statuses, so handlers can respond consistently and
 * clients can branch on `error.code` instead of string matching.
 *
 * A contract failure gets a second level of detail. The contracts raise typed
 * numeric codes, so the host reports `Error(Contract, #12)` — an integer with no
 * name attached, and the same integer means different things in different
 * contracts. `parseContractError` decodes it against the generated catalog in
 * `@/lib/contractErrors` and attaches `details.contractError`, which carries the
 * numeric code, the owning contract and — when the code is known — the variant
 * name and its documented meaning.
 */
import { classifyProtocolError, ERROR_CODE_BY_NAME, type AnyErrorCode } from '@bezamint/shared';
import {
  describeContractError,
  type ContractErrorDescriptor,
  type ContractName,
} from '@/lib/contractErrors';

/**
 * Every code an API error may carry.
 *
 * This used to be a hand-written union of nine names, which meant a route could
 * only say "bad request" — `COLLECTION_ARCHIVED` and `TOKEN_ALREADY_IN_COLLECTED`
 * were the same answer to a caller. It is now the catalogue's name union, so a
 * typo fails to compile and a new failure is a one-line addition to
 * `packages/shared/src/errors/codes.ts` rather than a new string in a handler.
 */
export type ApiErrorCode = AnyErrorCode;

export interface ApiErrorShape {
  error: {
    code: ApiErrorCode;
    /**
     * The catalogue's `BM-…` identifier.
     *
     * `code` is what a client branches on; this is what an operator greps a log
     * for and what a monitoring rule fires on. Both are published, because a
     * symbolic name alone is ambiguous the moment two domains reuse a word.
     */
    errorCode: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message?: string, status?: number, details?: unknown) {
    const definition = ERROR_CODE_BY_NAME[code];
    // The catalogue supplies the default message and status, so a call site with
    // nothing to add does not restate them and cannot drift from the docs.
    super(message ?? definition?.message ?? 'Request failed');
    this.name = 'ApiError';
    this.code = code;
    this.status = status ?? definition?.status ?? 500;
    this.details = details;
  }

  /** The catalogue entry this error was raised from, when the code is known. */
  get definition() {
    return ERROR_CODE_BY_NAME[this.code] ?? null;
  }

  /** Whether retrying the same request could plausibly succeed. */
  get retryable(): boolean {
    return this.definition?.retryable ?? false;
  }

  toJson(): ApiErrorShape {
    return {
      error: {
        code: this.code,
        errorCode: this.definition?.id ?? 'BM-API-0001',
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

/**
 * Best-effort human-readable message from an unknown thrown value.
 *
 * `err instanceof Error` is not sufficient, and relying on it cost a real
 * diagnosis: the Stellar SDK is a singleton in this workspace, but a second copy
 * of a dependency in a pnpm store tree does not share prototypes with this
 * realm, so its error classes fail `instanceof Error` here. That is how the
 * indexer came to log an RPC rejection as `"[object Object]"` — the message was
 * present the whole time, and the check discarded it.
 *
 * Anything carrying a non-empty string `message` is treated as an error,
 * whatever its prototype chain, and a JSON-RPC wrapper is unwrapped one level
 * because that is where those libraries put the useful text.
 */
export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const direct = (err as { message?: unknown }).message;
    if (typeof direct === 'string' && direct.length > 0) return direct;

    const nested = (err as { error?: { message?: unknown } }).error?.message;
    if (typeof nested === 'string' && nested.length > 0) return nested;

    try {
      const json = JSON.stringify(err);
      return json && json !== '{}' ? json : String(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/**
 * Which contract the failing call targeted, when the caller knows.
 *
 * `Error(Contract, #N)` does not name the contract — the number is only
 * meaningful against the enum of the contract that was called, so the call site
 * has to supply it. Codes are decodable without it; the name is a bonus.
 */
export interface ContractErrorContext {
  readonly contract?: ContractName | null;
}

/**
 * A decoded contract failure.
 *
 * `code` is always present when the message carried one. `contract` is present
 * when the call site supplied context. `variant` and `meaning` are `null` when
 * the code is not in the catalog — a contract deployed ahead of this build, or a
 * host error that is not a contract error. Nothing here throws: an unknown code
 * still reports its number, which is what a caller needs to look it up.
 */
export interface ContractErrorDetails {
  readonly code: number;
  readonly contract: ContractName | null;
  readonly variant: string | null;
  readonly meaning: string | null;
  readonly descriptor: ContractErrorDescriptor | null;
}

/**
 * The canonical host rendering, plus the diagnostic-event variant some RPC paths
 * stringify to instead. Both carry the same integer.
 */
const CONTRACT_ERROR_PATTERN = /Error\(\s*Contract\s*,\s*#(\d+)\s*\)/;
const NUMERIC_CONTRACT_ERROR_PATTERN = /\bcontract error[:\s]+#?(\d+)\b/i;

/**
 * Decode an `Error(Contract, #N)` from a thrown value.
 *
 * Returns `null` when the message carries no numeric contract code, so the
 * caller can fall back to the generic classification below.
 */
export function parseContractError(
  err: unknown,
  context: ContractErrorContext = {},
): ContractErrorDetails | null {
  const message = errorMessage(err);
  const match =
    CONTRACT_ERROR_PATTERN.exec(message) ?? NUMERIC_CONTRACT_ERROR_PATTERN.exec(message);
  if (!match) return null;

  const code = Number(match[1]);
  if (!Number.isSafeInteger(code) || code < 0) return null;

  const contract = context.contract ?? null;
  const descriptor = contract ? describeContractError(contract, code) : null;

  return {
    code,
    contract,
    variant: descriptor?.variant ?? null,
    meaning: descriptor?.meaning ?? null,
    descriptor,
  };
}

/**
 * Heuristic: does this look like a contract-level (panic/auth) failure?
 *
 * Matching is case-insensitive on purpose. The host spells it `HostError`, and
 * the previous case-sensitive `includes('host error')` meant the most common real
 * shape — `HostError: Error(Contract, #12)` — matched none of the patterns and
 * was reported to users as an opaque `500 INTERNAL` instead of a contract
 * failure. A decoded numeric code is likewise unambiguous evidence.
 */
function isContractError(err: unknown): boolean {
  if (parseContractError(err) !== null) return true;
  const message = errorMessage(err).toLowerCase();
  return (
    message.includes('host error') ||
    message.includes('contract error') ||
    message.includes('invokehostfunction') ||
    message.includes('require_auth') ||
    message.includes('panicked')
  );
}

/**
 * Heuristic: did an upstream hang rather than fail?
 *
 * `fetchWithTimeout` and `withTimeout` reject with `FetchTimeoutError`, so that
 * name is matched explicitly. Without this the declared `TIMEOUT` code was never
 * produced by anything: a hung RPC or IPFS gateway fell through to "unknown" and
 * was answered with an opaque 500 INTERNAL, hiding the one upstream condition
 * that is neither a client mistake nor a server crash.
 */
function isTimeoutError(err: unknown): boolean {
  const anyErr = err as { code?: string; name?: string };
  return (
    anyErr.name === 'TimeoutError' ||
    anyErr.name === 'FetchTimeoutError' ||
    anyErr.code === 'ETIMEDOUT'
  );
}

/** Heuristic: does this look like a network / RPC failure? */
function isNetworkError(err: unknown): boolean {
  const message = errorMessage(err);
  const anyErr = err as { code?: string; name?: string };
  return (
    anyErr.code === 'ECONNREFUSED' ||
    anyErr.code === 'ENOTFOUND' ||
    message.includes('Failed to fetch') ||
    message.includes('network') ||
    message.includes('connection')
  );
}

/**
 * Normalize any thrown value into an ApiError.
 * Unknown errors collapse to INTERNAL; caller-supplied status is preserved.
 *
 * Pass `context.contract` when the call site knows which contract it invoked:
 * the numeric code is decoded against that enum, so `details.contractError`
 * comes back with the variant name and meaning instead of a bare integer.
 */ export function normalizeError(err: unknown, context: ContractErrorContext = {}): ApiError {
  if (err instanceof ApiError) return err;

  const message = errorMessage(err);

  if (err instanceof TypeError && err.message === 'fetch failed') {
    return new ApiError('NETWORK_ERROR', 'Upstream service unreachable', 502, message);
  }

  // Checked before the network heuristic: a timeout is also a network symptom,
  // but it deserves its own code and a 504 so a caller can distinguish "the
  // upstream is reachable but slow" from "the upstream refused the connection".
  if (isTimeoutError(err)) {
    return new ApiError('TIMEOUT', 'Upstream request timed out', 504, message);
  }

  if (isNetworkError(err)) {
    return new ApiError('NETWORK_ERROR', 'Network request failed', 502, message);
  }

  const protocol = classifyProtocolError({
    ...extractResultCodes(err),
    message,
  });

  const contractError = parseContractError(err, context);
  if (contractError !== null || isContractError(err)) {
    return new ApiError('CONTRACT_ERROR', 'Contract call failed', 422, {
      message,
      ...(contractError !== null ? { contractError } : {}),
      ...(protocol !== null ? { stellar: stellarDetail(protocol) } : {}),
    });
  }

  // A Horizon submission failure carries the diagnosis in `result_codes`, and
  // that is not a contract error, so it used to collapse to INTERNAL/500: a user
  // whose sequence number was stale and a user whose balance was short both
  // read "Internal server error". The protocol code is the answer, and it was
  // already in the thrown value.
  if (protocol !== null) {
    const { definition } = protocol;
    return new ApiError(definition.name as ApiErrorCode, definition.message, definition.status, {
      message,
      stellar: stellarDetail(protocol),
    });
  }

  return new ApiError(
    'INTERNAL',
    'Internal server error',
    500,
    process.env.NODE_ENV === 'development' ? message : undefined,
  );
}

/**
 * Pull Stellar `result_codes` out of whatever shape the caller threw.
 *
 * Horizon nests them under `response.data.extras.result_codes`; the Soroban RPC
 * puts them on the error itself, and a hand-built error from the browser carries
 * them directly. All three are real shapes seen in this codebase, so all three
 * are read rather than only the one the server happens to meet.
 */
function extractResultCodes(err: unknown): {
  transaction?: string | null;
  operations?: readonly string[] | null;
} {
  const candidates: unknown[] = [
    (err as { result_codes?: unknown })?.result_codes,
    (err as { response?: { data?: { extras?: { result_codes?: unknown } } } })?.response?.data
      ?.extras?.result_codes,
    (err as { extras?: { result_codes?: unknown } })?.extras?.result_codes,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const codes = candidate as { transaction?: unknown; operations?: unknown };
    const transaction = typeof codes.transaction === 'string' ? codes.transaction : null;
    const operations = Array.isArray(codes.operations)
      ? codes.operations.filter((op): op is string => typeof op === 'string')
      : null;
    if (transaction !== null || (operations !== null && operations.length > 0)) {
      return { transaction, operations };
    }
  }

  return {};
}

/** The `details.stellar` payload attached to a classified protocol failure. */
export interface StellarFailureDetail {
  readonly id: string;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  /** The raw result code or host-error fragment that matched. */
  readonly matched: string | null;
}

function stellarDetail(classified: {
  definition: { id: string; name: string; message: string; retryable: boolean };
  matched: string | null;
}): StellarFailureDetail {
  return {
    id: classified.definition.id,
    code: classified.definition.name,
    message: classified.definition.message,
    retryable: classified.definition.retryable,
    matched: classified.matched,
  };
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError('BAD_REQUEST', message, 400, details);

/**
 * Raise any catalogue code, taking the default message and status from it.
 *
 * This is how a route says what actually went wrong — `COLLECTION_ARCHIVED`
 * rather than "bad request" — without restating a message the catalogue already
 * carries and the docs already publish.
 */
export const apiError = (code: ApiErrorCode, message?: string, details?: unknown) =>
  new ApiError(code, message, undefined, details);

/**
 * The caller did not authenticate. Raised for a mutating request that carried
 * neither a valid `x-api-key` nor a browser origin to attribute it to.
 *
 * `apps/web/src/middleware.ts` enforces this before a handler runs; the factory
 * exists here so the code has one home and handlers can raise it directly.
 */
export const unauthorized = (message = 'Authentication required') =>
  new ApiError('UNAUTHORIZED', message, 401);

/**
 * The caller authenticated, or was identifiable, but is not allowed to do this
 * -- an untrusted `Origin` on a mutating request, for instance.
 */
export const forbidden = (message = 'Not allowed') => new ApiError('FORBIDDEN', message, 403);

export const notFound = (message: string) => new ApiError('NOT_FOUND', message, 404);

export const rateLimited = (message = 'Too many requests') =>
  new ApiError('RATE_LIMITED', message, 429);

/** A required deployment configuration is absent, so this route cannot answer. */
export const notConfigured = (message: string, details?: unknown) =>
  new ApiError('CONTRACT_NOT_CONFIGURED', message, 503, details);

/** The indexer has not produced a usable snapshot yet. Retryable by design. */
export const indexerUnavailable = (message = 'The indexer is not ready yet') =>
  new ApiError('INDEXER_UNAVAILABLE', message, 503);

/** The request was understood and rejected on its content, not its shape. */
export const unprocessable = (code: ApiErrorCode, message?: string, details?: unknown) =>
  new ApiError(code, message, undefined, details);

export const internalError = (message = 'Internal server error', details?: unknown) =>
  new ApiError('INTERNAL', message, 500, details);

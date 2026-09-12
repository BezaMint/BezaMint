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
import {
  describeContractError,
  type ContractErrorDescriptor,
  type ContractName,
} from '@/lib/contractErrors';

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CONTRACT_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INTERNAL';

export interface ApiErrorShape {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJson(): ApiErrorShape {
    return {
      error: {
        code: this.code,
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

  const contractError = parseContractError(err, context);
  if (contractError !== null || isContractError(err)) {
    return new ApiError('CONTRACT_ERROR', 'Contract call failed', 422, {
      message,
      ...(contractError !== null ? { contractError } : {}),
    });
  }

  return new ApiError(
    'INTERNAL',
    'Internal server error',
    500,
    process.env.NODE_ENV === 'development' ? message : undefined,
  );
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError('BAD_REQUEST', message, 400, details);

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

export const internalError = (message = 'Internal server error', details?: unknown) =>
  new ApiError('INTERNAL', message, 500, details);

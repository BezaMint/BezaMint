/**
 * Shared timeout + abort handling for outbound fetches.
 *
 * Every fetch this server makes to an upstream (RPC, IPFS gateway, Pinata)
 * goes through here so a hung upstream cannot hang a route indefinitely.
 * Combines an AbortSignal timeout with the standard fetch, and lets callers
 * pass their own signal so a request cancellation propagates upstream.
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
  timeoutMessage?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class FetchTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchTimeoutError';
  }
}

/**
 * fetch() with a hard timeout. Rejects with FetchTimeoutError when the
 * deadline elapses, and forwards caller-provided abort signals.
 */
export async function fetchWithTimeout(
  url: string | URL,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, timeoutMessage, signal, ...rest } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Forward an external abort to the inner controller, and clean up when
  // either side wins the race.
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new FetchTimeoutError(timeoutMessage ?? `Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

/** Helper to race an arbitrary promise against a timeout (non-fetch callers). */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `Operation timed out after ${ms}ms`,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FetchTimeoutError(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

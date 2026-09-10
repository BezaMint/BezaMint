import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchWithTimeout, withTimeout, FetchTimeoutError } from '../http';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('resolves when the promise wins the race', async () => {
    vi.useFakeTimers();
    const promise = Promise.resolve(42);
    const result = withTimeout(promise, 1000);
    await expect(result).resolves.toBe(42);
  });

  it('rejects with FetchTimeoutError when the deadline elapses', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    const result = withTimeout(never, 100);
    const expectation = expect(result).rejects.toBeInstanceOf(FetchTimeoutError);
    vi.advanceTimersByTime(101);
    await expectation;
  });

  it('propagates the underlying rejection', async () => {
    vi.useFakeTimers();
    const failing = Promise.reject(new Error('boom'));
    const result = withTimeout(failing, 1000);
    await expect(result).rejects.toThrow('boom');
  });
});

describe('fetchWithTimeout', () => {
  it('forwards the response on success', async () => {
    const response = new Response('ok', { status: 200 });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const result = await fetchWithTimeout('https://example.com');
    expect(result.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects with FetchTimeoutError when the deadline elapses', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    });
    const result = fetchWithTimeout('https://example.com', { timeoutMs: 100 });
    const expectation = expect(result).rejects.toBeInstanceOf(FetchTimeoutError);
    vi.advanceTimersByTime(101);
    await expectation;
  });

  it('uses a custom timeout message', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    });
    const result = fetchWithTimeout('https://example.com', {
      timeoutMs: 50,
      timeoutMessage: 'custom timeout',
    });
    const expectation = expect(result).rejects.toThrow('custom timeout');
    vi.advanceTimersByTime(51);
    await expectation;
  });

  it('propagates caller-provided abort signals', async () => {
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
    });
    const result = fetchWithTimeout('https://example.com', {
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    controller.abort();
    await expect(result).rejects.toThrow('Aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

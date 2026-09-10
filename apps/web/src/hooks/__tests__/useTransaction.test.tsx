import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransaction } from '../useTransaction';

describe('useTransaction', () => {
  it('starts idle with empty state', () => {
    const { result } = renderHook(() => useTransaction());
    expect(result.current.status).toBe('idle');
    expect(result.current.isPending).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.txHash).toBeNull();
    expect(result.current.tokenId).toBeNull();
  });

  it('runs a successful flow and reports the token ID', async () => {
    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await result.current.execute(async (onStatus) => {
        onStatus('signing');
        return { txHash: 'hash-1', tokenId: 7 };
      });
    });

    expect(result.current.status).toBe('success');
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.txHash).toBe('hash-1');
    expect(result.current.tokenId).toBe(7);
  });

  it('passes status updates through to the UI', async () => {
    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await result.current.execute(async (onStatus) => {
        onStatus('preparing');
        onStatus('submitting');
        onStatus('confirming');
        return { txHash: 'h' };
      });
    });

    expect(result.current.status).toBe('success');
    expect(result.current.txHash).toBe('h');
  });

  it('captures errors into the error state and rethrows', async () => {
    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await expect(
        result.current.execute(async () => {
          throw new Error('network down');
        }),
      ).rejects.toThrow('network down');
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe('network down');
  });

  it('reset clears everything', async () => {
    const { result } = renderHook(() => useTransaction());

    await act(async () => {
      await result.current.execute(async () => ({ txHash: 'h' }));
    });
    expect(result.current.isSuccess).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.txHash).toBeNull();
    expect(result.current.tokenId).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

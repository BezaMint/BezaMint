'use client';

import { useState, useCallback } from 'react';
import type { MintStatus } from '@bezamint/shared';

interface TransactionState {
  status: MintStatus;
  txHash: string | null;
  error: string | null;
  tokenId: number | null;
}

export function useTransaction() {
  const [state, setState] = useState<TransactionState>({
    status: 'idle',
    txHash: null,
    error: null,
    tokenId: null,
  });

  const setStatus = useCallback((status: MintStatus) => {
    setState((s) => ({ ...s, status }));
  }, []);

  const setTxHash = useCallback((txHash: string) => {
    setState((s) => ({ ...s, txHash }));
  }, []);

  const setError = useCallback((error: string) => {
    setState((s) => ({ ...s, error, status: 'error' }));
  }, []);

  const setTokenId = useCallback((tokenId: number) => {
    setState((s) => ({ ...s, tokenId }));
  }, []);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      txHash: null,
      error: null,
      tokenId: null,
    });
  }, []);

  /**
   * Execute a minting transaction with full lifecycle management.
   * `executeFn` receives a status callback and should return { txHash, tokenId }.
   */
  const execute = useCallback(
    async (
      executeFn: (
        onStatus: (status: MintStatus) => void,
      ) => Promise<{ txHash: string; tokenId?: number }>,
    ) => {
      setStatus('preparing');
      setState((s) => ({ ...s, error: null }));

      try {
        const { txHash, tokenId } = await executeFn((newStatus) => {
          setStatus(newStatus);
        });

        if (txHash) {
          setTxHash(txHash);
        }
        if (tokenId) {
          setTokenId(tokenId);
        }

        setStatus('success');
        return { txHash, tokenId };
      } catch (err: any) {
        const message = err?.message || 'Transaction failed';
        setError(message);
        throw err;
      }
    },
    [setStatus, setTxHash, setTokenId, setError],
  );

  return {
    ...state,
    execute,
    reset,
    isPending:
      state.status === 'preparing' ||
      state.status === 'signing' ||
      state.status === 'submitting' ||
      state.status === 'confirming',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
  };
}

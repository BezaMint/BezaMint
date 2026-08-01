'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// ─────────────────────── Types ───────────────────────

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WalletState {
  address: string | null;
  network: string;
  connectionState: ConnectionState;
  error: string | null;
}

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchAccount: () => Promise<void>;
  isConnected: boolean;
  isConnecting: boolean;
}

// ─────────────────────── Context ───────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

// ─────────────────────── Provider ───────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    network: 'testnet',
    connectionState: 'disconnected',
    error: null,
  });

  const isFreighterInstalled = useCallback((): boolean => {
    return typeof window !== 'undefined' && !!(window as any).stellar?.isConnected;
  }, []);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connectionState: 'connecting', error: null }));

    try {
      if (!isFreighterInstalled()) {
        throw new Error('Freighter wallet is not installed. Please install the Freighter browser extension.');
      }

      const freighter = (window as any).stellar;
      const hasAccess = await freighter.requestAccess();

      if (!hasAccess) {
        throw new Error('Wallet access was denied. Please approve the connection request in Freighter.');
      }

      const publicKey = await freighter.getPublicKey();
      const network = await freighter.getNetwork();

      setState({
        address: publicKey,
        network: network === 'TESTNET' ? 'testnet' : 'mainnet',
        connectionState: 'connected',
        error: null,
      });
    } catch (err: any) {
      setState({
        address: null,
        network: 'testnet',
        connectionState: 'error',
        error: err?.message || 'Failed to connect wallet',
      });

      throw err;
    }
  }, [isFreighterInstalled]);

  const disconnect = useCallback(async () => {
    setState({
      address: null,
      network: 'testnet',
      connectionState: 'disconnected',
      error: null,
    });
  }, []);

  const switchAccount = useCallback(async () => {
    try {
      await disconnect();
      await connect();
    } catch {
      // User may cancel the switch
    }
  }, [connect, disconnect]);

  // Listen for Freighter account changes
  useEffect(() => {
    if (!isFreighterInstalled()) return;
    const freighter = (window as any).stellar;

    const unsubscribe = freighter.onAccountChanged
      ? freighter.onAccountChanged(async (publicKey: string | null) => {
          if (publicKey) {
            setState((s) => ({ ...s, address: publicKey }));
          } else {
            disconnect();
          }
        })
      : undefined;

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isFreighterInstalled, disconnect]);

  const value: WalletContextValue = {
    ...state,
    connect,
    disconnect,
    switchAccount,
    isConnected: state.connectionState === 'connected',
    isConnecting: state.connectionState === 'connecting',
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// ─────────────────────── Hook ───────────────────────

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}

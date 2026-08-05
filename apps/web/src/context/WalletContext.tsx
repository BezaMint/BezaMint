'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { isFreighterInstalled, getFreighterApi, onFreighterAccountChanged } from '@/lib/freighter';
import { fetchXlmBalance } from '@/services/stellar';

// ─────────────────────── Constants ───────────────────────

const SESSION_KEY = 'bezamint_wallet_session';

interface StoredSession {
  address: string;
  network: string;
  savedAt: number;
}

// ─────────────────────── Types ───────────────────────

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface BalanceState {
  balance: string | null;
  isLoading: boolean;
  error: string | null;
}

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
  balance: BalanceState;
  refreshBalance: () => Promise<void>;
}

// ─────────────────────── Context ───────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

// ─────────────────────── Helpers ───────────────────────

function saveSession(address: string, network: string) {
  try {
    const session: StoredSession = { address, network, savedAt: Date.now() };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage may be unavailable
  }
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: StoredSession = JSON.parse(raw);
    // Expire sessions older than 7 days
    if (Date.now() - session.savedAt > 7 * 24 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // localStorage may be unavailable
  }
}

// ─────────────────────── Provider ───────────────────────

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null,
    network: 'testnet',
    connectionState: 'disconnected',
    error: null,
  });

  const [balance, setBalance] = useState<BalanceState>({
    balance: null,
    isLoading: false,
    error: null,
  });

  const autoReconnected = useRef(false);

  // Fetch XLM balance for the connected address
  const refreshBalance = useCallback(async () => {
    if (!state.address) {
      setBalance({ balance: null, isLoading: false, error: null });
      return;
    }
    setBalance((b) => ({ ...b, isLoading: true, error: null }));
    try {
      const result = await fetchXlmBalance(state.address);
      setBalance({ balance: result, isLoading: false, error: null });
    } catch (err: unknown) {
      setBalance({
        balance: null,
        isLoading: false,
        error: err?.message || 'Failed to fetch balance',
      });
    }
  }, [state.address]);

  // Auto-reconnect on mount if a valid session exists
  useEffect(() => {
    if (autoReconnected.current || !isFreighterInstalled()) return;
    autoReconnected.current = true;

    const session = loadSession();
    if (!session) return;

    const freighter = getFreighterApi();
    freighter
      .getPublicKey()
      .then((publicKey: string) => {
        if (publicKey === session.address) {
          // Session is still valid – restore connection
          setState({
            address: publicKey,
            network: session.network,
            connectionState: 'connected',
            error: null,
          });
        } else {
          // Address changed in Freighter since last session
          clearSession();
        }
      })
      .catch(() => {
        // Freighter locked or not available – keep disconnected state
      });
  }, []);

  // Refresh balance after (re)connection
  useEffect(() => {
    if (state.connectionState === 'connected' && state.address) {
      refreshBalance();
    }
  }, [state.connectionState, state.address, refreshBalance]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connectionState: 'connecting', error: null }));

    try {
      if (!isFreighterInstalled()) {
        throw new Error(
          'Freighter wallet is not installed. Please install the Freighter browser extension.',
        );
      }

      const freighter = getFreighterApi();
      const hasAccess = await freighter.requestAccess();

      if (!hasAccess) {
        throw new Error(
          'Wallet access was denied. Please approve the connection request in Freighter.',
        );
      }

      const publicKey = await freighter.getPublicKey();
      const network = await freighter.getNetwork();
      const networkName = network === 'TESTNET' ? 'testnet' : 'mainnet';

      saveSession(publicKey, networkName);

      setState({
        address: publicKey,
        network: networkName,
        connectionState: 'connected',
        error: null,
      });

      // Balance refresh is handled by the connectionState effect above
    } catch (err: unknown) {
      setState({
        address: null,
        network: 'testnet',
        connectionState: 'error',
        error: err?.message || 'Failed to connect wallet',
      });

      throw err;
    }
  }, []);

  const disconnect = useCallback(async () => {
    clearSession();
    setBalance({ balance: null, isLoading: false, error: null });
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
    const freighter = getFreighterApi();

    const unsubscribe = freighter.onAccountChanged
      ? freighter.onAccountChanged(async (publicKey: string | null) => {
          if (publicKey) {
            const network = await freighter.getNetwork();
            const networkName = network === 'TESTNET' ? 'testnet' : 'mainnet';
            saveSession(publicKey, networkName);
            setState((s) => ({ ...s, address: publicKey, network: networkName }));
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
  }, [disconnect]);

  // Keyboard shortcut: Ctrl+Shift+D to disconnect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        disconnect();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disconnect]);

  const value: WalletContextValue = {
    ...state,
    connect,
    disconnect,
    switchAccount,
    isConnected: state.connectionState === 'connected',
    isConnecting: state.connectionState === 'connecting',
    balance,
    refreshBalance,
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

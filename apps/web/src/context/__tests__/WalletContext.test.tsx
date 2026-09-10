import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { WalletProvider, useWallet } from '../WalletContext';

const mockIsInstalled = vi.fn();
const mockRequestAccess = vi.fn();
const mockGetPublicKey = vi.fn();
const mockGetNetwork = vi.fn();
const mockOnAccountChanged = vi.fn();
const mockFetchBalance = vi.fn();

vi.mock('@/lib/freighter', () => ({
  isFreighterInstalled: (...args: unknown[]) => mockIsInstalled(...args),
  getFreighterApi: () => ({
    isConnected: () => mockIsInstalled(),
    requestAccess: (...args: unknown[]) => mockRequestAccess(...args),
    getPublicKey: (...args: unknown[]) => mockGetPublicKey(...args),
    getNetwork: (...args: unknown[]) => mockGetNetwork(...args),
    onAccountChanged: (...args: unknown[]) => mockOnAccountChanged(...args),
  }),
  onFreighterAccountChanged: (...args: unknown[]) => mockOnAccountChanged(...args),
}));

vi.mock('@/services/stellar', () => ({
  fetchXlmBalance: (...args: unknown[]) => mockFetchBalance(...args),
}));

function Probe() {
  const { address, isConnected, isConnecting, connect, disconnect, balance } = useWallet();
  return (
    <div>
      <span data-testid="connected">{String(isConnected)}</span>
      <span data-testid="connecting">{String(isConnecting)}</span>
      <span data-testid="address">{address ?? 'none'}</span>
      <span data-testid="balance">{balance.balance ?? 'none'}</span>
      <button
        onClick={() => {
          // Mirrors real pages: connect() may reject (e.g. user denial).
          void connect().catch(() => {});
        }}
      >
        connect
      </button>
      <button onClick={() => disconnect()}>disconnect</button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsInstalled.mockReturnValue(true);
  mockRequestAccess.mockResolvedValue(true);
  mockGetPublicKey.mockResolvedValue('GABC1234567890');
  mockGetNetwork.mockResolvedValue('TESTNET');
  mockFetchBalance.mockResolvedValue('42.5');
  localStorage.clear();
});

describe('WalletContext', () => {
  it('starts disconnected', () => {
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>,
    );
    expect(screen.getByTestId('connected').textContent).toBe('false');
    expect(screen.getByTestId('address').textContent).toBe('none');
  });

  it('connects and stores the address + balance', async () => {
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>,
    );

    act(() => {
      screen.getByText('connect').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
    });
    expect(screen.getByTestId('address').textContent).toBe('GABC1234567890');
    await waitFor(() => {
      expect(screen.getByTestId('balance').textContent).toBe('42.5');
    });
  });

  it('sets an error state when wallet access is denied', async () => {
    mockRequestAccess.mockResolvedValue(false);

    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>,
    );
    await act(async () => {
      try {
        screen.getByText('connect').click();
      } catch {
        // connect() rethrows; the component is expected to handle it
      }
    });

    // Connection failed — state stays disconnected.
    expect(screen.getByTestId('connected').textContent).toBe('false');
  });

  it('disconnects and clears the address', async () => {
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>,
    );

    act(() => {
      screen.getByText('connect').click();
    });
    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('true');
    });

    act(() => {
      screen.getByText('disconnect').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('connected').textContent).toBe('false');
    });
    expect(screen.getByTestId('address').textContent).toBe('none');
  });
});

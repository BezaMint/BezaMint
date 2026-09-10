import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import MintForm from '../MintForm';

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();
const mockExecute = vi.fn();
const mockConnect = vi.fn();

// Mutable wallet state so tests can vary balance/connection per case.
const walletState = {
  address: 'GABC1234567890123456789012345678901234567890123456789012345678',
  isConnected: true,
  balance: { balance: '50.0', isLoading: false },
};

vi.mock('@/context', () => ({
  useWallet: () => ({
    address: walletState.address,
    isConnected: walletState.isConnected,
    connect: mockConnect,
    balance: walletState.balance,
  }),
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showLoading: vi.fn(),
    dismissToast: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTransaction', () => ({
  useTransaction: () => ({
    status: 'idle',
    txHash: null,
    error: null,
    tokenId: null,
    execute: mockExecute,
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
  }),
}));

vi.mock('@/services', () => ({
  mintNft: vi.fn(),
  signAndSubmit: vi.fn(),
  uploadMetadataToIpfs: vi.fn(),
  checkBalance: vi.fn().mockResolvedValue({ sufficient: true, balance: '50', minimumRequired: 1 }),
  getTotalSupply: vi.fn().mockResolvedValue(0),
  getCollectionsByCreator: vi.fn().mockResolvedValue([]),
  createCollection: vi.fn(),
  getExplorerTxUrl: vi.fn((h: string) => `https://explorer/${h}`),
}));

beforeEach(() => {
  vi.clearAllMocks();
  walletState.address = 'GABC1234567890123456789012345678901234567890123456789012345678';
  walletState.isConnected = true;
  walletState.balance = { balance: '50.0', isLoading: false };
});

describe('MintForm', () => {
  it('shows validation errors for empty required fields', async () => {
    render(<MintForm />);

    fireEvent.click(screen.getByRole('button', { name: /mint nft/i }));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    expect(screen.getByText('Image URI is required')).toBeInTheDocument();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('blocks submission with an over-length description', async () => {
    render(<MintForm />);

    const desc = screen.getByPlaceholderText(/describe your nft/i);
    fireEvent.change(desc, { target: { value: 'x'.repeat(2001) } });
    fireEvent.click(screen.getByRole('button', { name: /mint nft/i }));

    await waitFor(() => {
      expect(screen.getByText('Description must be 2000 characters or fewer')).toBeInTheDocument();
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('warns when royalty shares do not total 100%', async () => {
    render(<MintForm />);

    // Enable royalties via the toggle (labelled "Royalties")
    const royaltyToggle = screen
      .getByText('Royalties')
      .closest('div')
      ?.parentElement?.querySelector('button');
    if (!royaltyToggle) throw new Error('royalty toggle not found');
    fireEvent.click(royaltyToggle);

    // Set a basis-point value; the default recipient share (100%) stays valid,
    // so also change it to force the total away from 100.
    const shareInputs = screen.getAllByPlaceholderText('Share');
    const shareInput = shareInputs[0];
    if (!shareInput) throw new Error('share input not found');
    fireEvent.change(shareInput, { target: { value: '50' } });

    fireEvent.click(screen.getByRole('button', { name: /mint nft/i }));

    await waitFor(() => {
      expect(screen.getByText('Royalty shares must total 100%')).toBeInTheDocument();
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('shows a low-balance warning when funds are insufficient', () => {
    walletState.balance = { balance: '0.5', isLoading: false };

    render(<MintForm />);
    expect(screen.getByText(/low balance/i)).toBeInTheDocument();
  });

  it('renders the connect prompt when the wallet is disconnected', () => {
    walletState.isConnected = false;

    render(<MintForm />);
    expect(screen.getByText('Connect Your Wallet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
  });
});

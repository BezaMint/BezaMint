import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TxError, TxErrorType } from '@/services/contracts';

// ─────────────────────── TxError categorisation ───────────────────────

describe('TxError', () => {
  it('creates error with type', () => {
    const e = new TxError('msg', TxErrorType.WalletNotInstalled);
    expect(e.type).toBe(TxErrorType.WalletNotInstalled);
    expect(e.name).toBe('TxError');
  });

  it('classifies wallet-not-installed errors', () => {
    const e = new TxError('Freighter wallet is not installed.', TxErrorType.WalletNotInstalled);
    expect(e.type).toBe(TxErrorType.WalletNotInstalled);
  });

  it('classifies user-cancelled errors', () => {
    const e = new TxError('Transaction was cancelled by user.', TxErrorType.UserCancelled);
    expect(e.type).toBe(TxErrorType.UserCancelled);
  });

  it('classifies timeout errors', () => {
    const e = new TxError('Transaction not finalized after 20 attempts', TxErrorType.Timeout);
    expect(e.type).toBe(TxErrorType.Timeout);
  });
});

// ─────────────────────── Formatting helpers ───────────────────────

import { formatXlm } from '@bezamint/shared';

describe('formatXlm', () => {
  it('formats numbers', () => {
    expect(formatXlm(10)).toBe('10.0000000 XLM');
  });

  it('formats numeric strings (Horizon balance format)', () => {
    expect(formatXlm('3.14')).toBe('3.1400000 XLM');
  });

  it('handles NaN gracefully', () => {
    expect(formatXlm('not-a-number')).toBe('0.0000000 XLM');
  });
});

// ─────────────────────── On-chain service guard (mock) ───────────────────────

// Verify service functions degrade gracefully when the RPC is unreachable
// rather than throwing unhandled exceptions.

vi.mock('@/services/stellar', () => ({
  buildContractTransaction: vi.fn().mockRejectedValue(new Error('network down')),
  simulateTransaction: vi.fn().mockRejectedValue(new Error('network down')),
  submitSignedTransaction: vi.fn().mockRejectedValue(new Error('network down')),
  waitForTransaction: vi.fn().mockRejectedValue(new Error('network down')),
  getRpcClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/freighter', () => ({
  isFreighterInstalled: vi.fn().mockReturnValue(false),
  getFreighterApi: vi.fn().mockReturnValue(null),
  signFreighterTransaction: vi.fn().mockRejectedValue(new Error('no wallet')),
}));

describe('contract service graceful degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 0 for total supply when RPC is unreachable', async () => {
    const { getTotalSupply } = await import('@/services/contracts');
    const result = await getTotalSupply('GABC1234');
    expect(result).toBe(0);
  });

  it('returns null for owner_of when RPC is unreachable', async () => {
    const { getOwnerOf } = await import('@/services/contracts');
    const result = await getOwnerOf('GABC1234', 1);
    expect(result).toBeNull();
  });

  it('throws categorized error when signing without wallet', async () => {
    const { signAndSubmit } = await import('@/services/contracts');
    await expect(signAndSubmit('xdr')).rejects.toMatchObject({
      type: TxErrorType.WalletNotInstalled,
    });
  });
});

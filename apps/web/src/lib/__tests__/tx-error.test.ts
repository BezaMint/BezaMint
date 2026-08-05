import { describe, it, expect } from 'vitest';
import { TxError, TxErrorType } from '@/services/contracts';

describe('TxError', () => {
  it('creates error with type', () => {
    const e = new TxError('msg', TxErrorType.WalletNotInstalled);
    expect(e.type).toBe(TxErrorType.WalletNotInstalled);
    expect(e.name).toBe('TxError');
  });
});

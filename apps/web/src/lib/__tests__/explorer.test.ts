import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildExplorerUrl, getExplorerTxUrl, getExplorerAccountUrl } from '../explorer';

const ORIGINAL_URL = process.env.NEXT_PUBLIC_EXPLORER_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_EXPLORER_URL = 'https://stellar.expert/explorer/testnet';
});

afterEach(() => {
  if (ORIGINAL_URL === undefined) {
    delete process.env.NEXT_PUBLIC_EXPLORER_URL;
  } else {
    process.env.NEXT_PUBLIC_EXPLORER_URL = ORIGINAL_URL;
  }
});

describe('explorer URL helpers', () => {
  it('builds a tx URL from the configured base', () => {
    expect(getExplorerTxUrl('abc123')).toBe('https://stellar.expert/explorer/testnet/tx/abc123');
  });

  it('builds an account URL from the configured base', () => {
    expect(getExplorerAccountUrl('GABC')).toBe(
      'https://stellar.expert/explorer/testnet/account/GABC',
    );
  });

  it('builds generic explorer URLs per entity', () => {
    expect(buildExplorerUrl('contract', 'C123')).toBe(
      'https://stellar.expert/explorer/testnet/contract/C123',
    );
    expect(buildExplorerUrl('ledger', '42')).toBe(
      'https://stellar.expert/explorer/testnet/ledger/42',
    );
  });

  it('encodes special characters in IDs', () => {
    expect(buildExplorerUrl('tx', 'a/b c')).toBe(
      'https://stellar.expert/explorer/testnet/tx/a%2Fb%20c',
    );
  });

  it('respects a custom explorer base URL (e.g. mainnet)', () => {
    process.env.NEXT_PUBLIC_EXPLORER_URL = 'https://stellar.expert/explorer/public';
    expect(getExplorerTxUrl('hash1')).toBe('https://stellar.expert/explorer/public/tx/hash1');
  });

  it('strips trailing slashes from the base URL', () => {
    process.env.NEXT_PUBLIC_EXPLORER_URL = 'https://example.com/explorer/';
    expect(getExplorerTxUrl('hash1')).toBe('https://example.com/explorer/tx/hash1');
  });

  it('falls back to the default testnet explorer when unset', () => {
    delete process.env.NEXT_PUBLIC_EXPLORER_URL;
    expect(getExplorerAccountUrl('G123')).toBe(
      'https://stellar.expert/explorer/testnet/account/G123',
    );
  });
});

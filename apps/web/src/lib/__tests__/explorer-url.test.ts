import { describe, expect, it } from 'vitest';

import { buildExplorerUrl, explorerUrl } from '@/lib/explorer-url';

describe('buildExplorerUrl', () => {
  it('builds testnet transaction URLs', () => {
    expect(buildExplorerUrl('testnet', 'tx', 'abc123')).toBe(
      'https://stellar.expert/explorer/testnet/tx/abc123',
    );
  });

  it('builds testnet account URLs', () => {
    expect(buildExplorerUrl('testnet', 'account', 'GABC123')).toBe(
      'https://stellar.expert/explorer/testnet/account/GABC123',
    );
  });

  it('builds testnet contract URLs', () => {
    expect(buildExplorerUrl('testnet', 'contract', 'C123')).toBe(
      'https://stellar.expert/explorer/testnet/contract/C123',
    );
  });

  it('builds mainnet transaction URLs', () => {
    expect(buildExplorerUrl('mainnet', 'tx', 'abc123')).toBe(
      'https://stellar.expert/explorer/public/tx/abc123',
    );
  });

  it('builds mainnet account URLs', () => {
    expect(buildExplorerUrl('mainnet', 'account', 'GABC123')).toBe(
      'https://stellar.expert/explorer/public/account/GABC123',
    );
  });

  it('builds mainnet contract URLs', () => {
    expect(buildExplorerUrl('mainnet', 'contract', 'C123')).toBe(
      'https://stellar.expert/explorer/public/contract/C123',
    );
  });

  it('accepts an explicit base URL and trims trailing slashes', () => {
    expect(buildExplorerUrl('testnet', 'contract', 'C123', 'https://example.com/')).toBe(
      'https://example.com/contract/C123',
    );
  });

  it('encodes path segments', () => {
    expect(buildExplorerUrl('testnet', 'tx', 'a b/c')).toBe(
      'https://stellar.expert/explorer/testnet/tx/a%20b%2Fc',
    );
  });
});

describe('explorerUrl', () => {
  it('uses the configured explorer base URL when provided', () => {
    expect(explorerUrl('testnet', 'account', 'GABC', 'https://explorer.example/')).toBe(
      'https://explorer.example/account/GABC',
    );
  });
});

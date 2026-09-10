import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectStartupIssues } from '@/lib/startup';

const ORIGINAL_ENV = process.env;

// Valid 56-char Soroban contract id (test vector).
const VALID_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('collectStartupIssues', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_NFT_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_COLLECTION_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_ROYALTY_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_CREATOR_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID;
    delete process.env.PINATA_JWT;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('flags missing contract ids and the missing pinata key', () => {
    const issues = collectStartupIssues();
    expect(issues).toHaveLength(6); // 5 contracts + pinata
    expect(issues.filter((i) => i.level === 'warn').length).toBe(6);
  });

  it('flags malformed contract ids as errors', () => {
    process.env.NEXT_PUBLIC_NFT_CONTRACT_ID = 'not-a-contract';
    const issues = collectStartupIssues();
    const nft = issues.find((i) => i.key === 'NEXT_PUBLIC_NFT_CONTRACT_ID');
    expect(nft?.level).toBe('error');
    expect(nft?.message).toContain('not a valid Soroban contract ID');
  });

  it('accepts well-formed contract ids', () => {
    process.env.NEXT_PUBLIC_NFT_CONTRACT_ID = VALID_ID;
    process.env.NEXT_PUBLIC_COLLECTION_CONTRACT_ID = VALID_ID;
    process.env.NEXT_PUBLIC_ROYALTY_CONTRACT_ID = VALID_ID;
    process.env.NEXT_PUBLIC_CREATOR_CONTRACT_ID = VALID_ID;
    process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID = VALID_ID;
    process.env.PINATA_JWT = 'jwt';
    const issues = collectStartupIssues();
    expect(issues).toHaveLength(0);
  });

  it('is safe to call repeatedly', () => {
    process.env.PINATA_JWT = 'jwt';
    expect(collectStartupIssues().length).toBe(5);
    expect(collectStartupIssues().length).toBe(5);
  });
});

import { describe, expect, it } from 'vitest';
import {
  NFT_METADATA_SCHEMA,
  validateAgainstSchema,
  isValidNftMetadata,
  formatIssues,
} from '../metadataSchema';

describe('NFT_METADATA_SCHEMA', () => {
  it('accepts a minimal valid document', () => {
    expect(isValidNftMetadata({ name: 'My NFT' })).toBe(true);
  });

  it('accepts a fully populated document', () => {
    const doc = {
      name: 'Genesis',
      description: 'First NFT',
      imageUri: 'ipfs://QmX',
      animationUri: 'ipfs://QmY',
      externalUrl: 'https://example.com',
      collectionId: '1',
      royalties: 500,
      attributes: [
        { traitType: 'Rarity', value: 'Legendary' },
        { trait_type: 'Color', value: 'Gold', display_type: 'string' },
      ],
    };
    expect(isValidNftMetadata(doc)).toBe(true);
  });

  it('rejects a document without a name', () => {
    const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, { description: 'x' });
    expect(issues.some((i) => i.path === 'name' && i.message === 'required')).toBe(true);
  });

  it('rejects a non-object document', () => {
    expect(isValidNftMetadata('not-an-object')).toBe(false);
    expect(isValidNftMetadata(null)).toBe(false);
    expect(isValidNftMetadata([1, 2])).toBe(false);
  });

  it('rejects unknown properties', () => {
    const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, {
      name: 'x',
      injected: 'bad',
    });
    expect(issues.some((i) => i.path === 'injected')).toBe(true);
  });

  it('rejects an over-long name', () => {
    const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, {
      name: 'x'.repeat(129),
    });
    expect(issues.some((i) => i.message.includes('longer than 128'))).toBe(true);
  });

  it('rejects a non-string description', () => {
    const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, {
      name: 'x',
      description: 42,
    });
    expect(issues.some((i) => i.path === 'description')).toBe(true);
  });

  it('rejects attributes that are not an array', () => {
    const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, {
      name: 'x',
      attributes: 'oops',
    });
    expect(issues.some((i) => i.path === 'attributes')).toBe(true);
  });

  it('rejects more than 20 attributes', () => {
    const doc = {
      name: 'x',
      attributes: Array.from({ length: 21 }, (_, i) => ({
        traitType: `t${i}`,
        value: 'v',
      })),
    };
    expect(isValidNftMetadata(doc)).toBe(false);
  });

  it('rejects attributes missing value', () => {
    expect(isValidNftMetadata({ name: 'x', attributes: [{ traitType: 't' }] })).toBe(false);
  });

  it('accepts a trait using the snake_case spelling without camelCase', () => {
    expect(
      isValidNftMetadata({ name: 'x', attributes: [{ trait_type: 'Color', value: 'Gold' }] }),
    ).toBe(true);
  });

  it('rejects a negative royalty', () => {
    const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, {
      name: 'x',
      royalties: -1,
    });
    expect(issues.some((i) => i.path === 'royalties')).toBe(true);
  });

  it('rejects a royalty above 10000 bps', () => {
    expect(isValidNftMetadata({ name: 'x', royalties: 10001 })).toBe(false);
    expect(isValidNftMetadata({ name: 'x', royalties: 10000 })).toBe(true);
  });

  it('formats issues with paths', () => {
    const issues = validateAgainstSchema(NFT_METADATA_SCHEMA, {});
    expect(formatIssues(issues)).toContain('name: required');
  });
});

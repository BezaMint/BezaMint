import { describe, expect, it } from 'vitest';
import {
  MAX_ATTRIBUTE_ITEMS,
  NFT_METADATA_DOCUMENT_SCHEMA,
  NFT_METADATA_SCHEMA,
  formatIssues,
  validateAgainstSchema,
} from '../metadataSchema';
import { buildMetadataDocument } from '../nftMetadataDocument';

/**
 * The regression these guard: the metadata proxy validated documents fetched
 * back from IPFS against the *upload request* schema. Every document the
 * upload route had written failed that validation, so `GET /api/ipfs/metadata`
 * answered 422 for this app's own content -- and nothing caught it, because the
 * two schemas were only ever exercised separately.
 */

/** A complete upload request, in the shape the route accepts. */
const REQUEST = {
  name: 'Stellar Drift #01',
  description: 'Piece 1 of 6.',
  imageUri: 'https://example.com/art/01.svg',
  animationUri: 'https://example.com/art/01.mp4',
  externalUrl: 'https://bezamint.vercel.app/nft/1',
  collectionId: '1',
  royalties: 500,
  attributes: [
    { traitType: 'Palette', value: 'Cool Blues', displayType: 'string' },
    { trait_type: 'Edition', value: 'Genesis' },
  ],
};

/** What the proxy actually sees: the document after a JSON round trip. */
function asFetched(document: unknown): unknown {
  return JSON.parse(JSON.stringify(document));
}

function issueList(schema: typeof NFT_METADATA_DOCUMENT_SCHEMA, value: unknown) {
  return validateAgainstSchema(schema, value);
}

function issuesFor(schema: typeof NFT_METADATA_DOCUMENT_SCHEMA, value: unknown): string {
  return formatIssues(issueList(schema, value));
}

describe('buildMetadataDocument', () => {
  it('produces a document the read path accepts', () => {
    const document = buildMetadataDocument(REQUEST, 'Stellar Drift #01');
    expect(issuesFor(NFT_METADATA_DOCUMENT_SCHEMA, asFetched(document))).toBe('');
  });

  it('produces a document the upload request schema rejects', () => {
    // Not a bug to fix: the document is the ERC-721 shape, the request is the
    // app's intent shape. This asserts they stay different, because pointing
    // the proxy at the request schema is exactly what broke it.
    const document = buildMetadataDocument(REQUEST, 'Stellar Drift #01');
    expect(issueList(NFT_METADATA_SCHEMA, document).length).toBeGreaterThan(0);
  });

  it('uses the conventional metadata keys, not the request keys', () => {
    const document = buildMetadataDocument(REQUEST, 'Stellar Drift #01');
    expect(document.image).toBe(REQUEST.imageUri);
    expect(document.animation_url).toBe(REQUEST.animationUri);
    expect(document.external_url).toBe(REQUEST.externalUrl);
    expect(document.properties.collection_id).toBe('1');
    expect(document.properties.royalties).toBe(500);
    expect(document).not.toHaveProperty('imageUri');
    expect(document).not.toHaveProperty('collectionId');
  });

  it('accepts either spelling of an attribute key', () => {
    const document = buildMetadataDocument(REQUEST, 'x');
    expect(document.attributes).toEqual([
      { trait_type: 'Palette', value: 'Cool Blues', display_type: 'string' },
      { trait_type: 'Edition', value: 'Genesis', display_type: undefined },
    ]);
  });

  it('gives a minimal request the same shape as a complete one', () => {
    const document = buildMetadataDocument({ name: 'Bare' }, 'Bare');
    expect(document).toEqual({
      name: 'Bare',
      description: '',
      image: '',
      animation_url: '',
      external_url: '',
      attributes: [],
      properties: { collection_id: '', royalties: null },
    });
    expect(issuesFor(NFT_METADATA_DOCUMENT_SCHEMA, asFetched(document))).toBe('');
  });

  it('keeps null royalties as null rather than dropping the field', () => {
    const document = buildMetadataDocument({ name: 'x', royalties: 0 }, 'x');
    // 0 is a real value (no royalty), so it must survive.
    expect(document.properties.royalties).toBe(0);
  });
});

describe('NFT_METADATA_DOCUMENT_SCHEMA', () => {
  it('allows fields written by another minter', () => {
    // A content-addressed document can carry anything; only the fields the UI
    // reads are checked, so the proxy stays useful for third-party metadata.
    const document = {
      name: 'x',
      background_color: 'ffffff',
      youtube_url: 'https://example.com',
      tokenId: 7,
    };
    expect(issuesFor(NFT_METADATA_DOCUMENT_SCHEMA, document)).toBe('');
  });

  it('rejects a value the UI cannot render', () => {
    const issues = issuesFor(NFT_METADATA_DOCUMENT_SCHEMA, { name: 'x', image: 42 });
    expect(issues).toMatch(/image/);
  });

  it('rejects a document that is not an object', () => {
    for (const value of ['a string', 7, null, [1, 2]]) {
      expect(issueList(NFT_METADATA_DOCUMENT_SCHEMA, value).length).toBeGreaterThan(0);
    }
  });

  it('bounds the attribute list', () => {
    const attributes = Array.from({ length: MAX_ATTRIBUTE_ITEMS + 1 }, (_, i) => ({
      trait_type: 'n',
      value: String(i),
    }));
    expect(issuesFor(NFT_METADATA_DOCUMENT_SCHEMA, { name: 'x', attributes })).toMatch(
      /more than 20 items/,
    );
  });
});

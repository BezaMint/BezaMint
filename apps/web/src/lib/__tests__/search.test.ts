import { describe, it, expect } from 'vitest';
import { filterSearchResults, hasCategoryData } from '../search';
import type { SearchResultShape } from '../search';

const RESULTS: SearchResultShape[] = [
  { type: 'nft', title: 'A', subtitle: '', category: 'art' },
  { type: 'nft', title: 'B', subtitle: '' },
  { type: 'collection', title: 'C', subtitle: '', category: 'gaming' },
  { type: 'collection', title: 'D', subtitle: '' },
  { type: 'creator', title: 'E', subtitle: '', category: 'art' },
];

describe('filterSearchResults', () => {
  it('returns everything for the all tab with no categories', () => {
    expect(filterSearchResults(RESULTS, 'all', [])).toHaveLength(5);
  });

  it('filters by tab', () => {
    const nfts = filterSearchResults(RESULTS, 'nfts', []);
    expect(nfts.map((r) => r.title)).toEqual(['A', 'B']);

    const collections = filterSearchResults(RESULTS, 'collections', []);
    expect(collections.map((r) => r.title)).toEqual(['C', 'D']);

    const creators = filterSearchResults(RESULTS, 'creators', []);
    expect(creators.map((r) => r.title)).toEqual(['E']);
  });

  it('filters by selected categories', () => {
    const art = filterSearchResults(RESULTS, 'all', ['art']);
    expect(art.map((r) => r.title)).toEqual(['A', 'E']);
  });

  it('combines tab and category filters', () => {
    const result = filterSearchResults(RESULTS, 'nfts', ['art']);
    expect(result.map((r) => r.title)).toEqual(['A']);
  });

  it('returns empty when tab+category excludes everything', () => {
    expect(filterSearchResults(RESULTS, 'creators', ['gaming'])).toEqual([]);
  });

  it('ignores category filters on results that lack category data', () => {
    const uncategorized = filterSearchResults(RESULTS, 'all', ['nonexistent']);
    expect(uncategorized).toEqual([]);
  });
});

describe('hasCategoryData', () => {
  it('detects when results carry category info', () => {
    expect(hasCategoryData(RESULTS)).toBe(true);
  });

  it('returns false when no result has a category', () => {
    const noCats = RESULTS.map(({ type, title, subtitle }) => ({ type, title, subtitle }));
    expect(hasCategoryData(noCats)).toBe(false);
  });
});

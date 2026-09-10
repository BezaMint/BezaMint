/**
 * Pure search filtering helpers shared by the explore search UI.
 * Kept free of React/DOM so the logic is directly unit-testable.
 */

export type SearchResultType = 'nft' | 'collection' | 'creator';

export interface SearchResultShape {
  type: SearchResultType;
  title: string;
  subtitle: string;
  category?: string;
}

export type SearchTab = 'all' | 'nfts' | 'collections' | 'creators';

const TAB_TYPE_MAP: Record<Exclude<SearchTab, 'all'>, SearchResultType> = {
  nfts: 'nft',
  collections: 'collection',
  creators: 'creator',
};

/**
 * Filter a set of search results by tab and category selection.
 * Returns the full list when no tab/category constraints apply.
 */
export function filterSearchResults<T extends SearchResultShape>(
  results: T[],
  tab: SearchTab,
  categories: string[],
): T[] {
  let list = results;

  if (tab !== 'all') {
    const type = TAB_TYPE_MAP[tab];
    list = list.filter((r) => r.type === type);
  }

  if (categories.length > 0) {
    list = list.filter((r) => r.category && categories.includes(r.category));
  }

  return list;
}

/**
 * Whether a category filter has any matchable results at all. Lets the UI
 * hide or explain filters when the current data carries no category info.
 */
export function hasCategoryData<T extends SearchResultShape>(results: T[]): boolean {
  return results.some((r) => !!r.category);
}

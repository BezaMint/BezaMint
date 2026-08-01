'use client';

import { useState, useMemo, useCallback } from 'react';
import SearchBar from './SearchBar';
import SearchFilters from './SearchFilters';
import SearchResultCard from './SearchResultCard';

const CATEGORIES = [
  { value: 'art', label: 'Art' },
  { value: 'music', label: 'Music' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'sports', label: 'Sports' },
  { value: 'photography', label: 'Photography' },
  { value: 'brand', label: 'Brand' },
  { value: 'other', label: 'Other' },
];

const MOCK_RESULTS = [
  { type: 'nft' as const, title: 'Abstract #001', subtitle: 'Token #1 in Digital Artworks', href: '/explore', tags: ['abstract', 'digital'] },
  { type: 'collection' as const, title: 'Digital Artworks', subtitle: '12 NFTs by GABC...DEFG', href: '/collections/1', tags: ['art', 'modern'] },
  { type: 'creator' as const, title: 'Beza Creator', subtitle: '42 NFTs · 5 Collections', href: '/creators/GABC123', isVerified: true },
  { type: 'nft' as const, title: 'Gaming Sword', subtitle: 'Token #4 in Gaming Assets', href: '/explore', tags: ['rpg', 'weapon'] },
  { type: 'collection' as const, title: 'Gaming Assets', subtitle: '8 NFTs by GXYZ...ABCD', href: '/collections/2', tags: ['gaming', 'items'] },
  { type: 'creator' as const, title: 'Pixel Artist', subtitle: '15 NFTs · 2 Collections', href: '/creators/GXYZ123' },
];

type Tab = 'all' | 'nfts' | 'collections' | 'creators';

export default function SearchResults() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [filters, setFilters] = useState<string[]>([]);

  const filtered = useMemo(() => {
    let results = MOCK_RESULTS;
    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.subtitle.toLowerCase().includes(q) ||
          r.tags?.some((t) => t.includes(q)),
      );
    }
    if (activeTab !== 'all') {
      const typeMap: Record<string, string> = { nfts: 'nft', collections: 'collection', creators: 'creator' };
      results = results.filter((r) => r.type === typeMap[activeTab]);
    }
    return results;
  }, [query, activeTab, filters]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All Results' },
    { key: 'nfts', label: 'NFTs' },
    { key: 'collections', label: 'Collections' },
    { key: 'creators', label: 'Creators' },
  ];

  return (
    <div className="space-y-6">
      <SearchBar onSearch={setQuery} initialQuery={query} />

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-bezamint-muted/30 border border-bezamint-border w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-bezamint-primary/20 text-bezamint-secondary'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SearchFilters categories={CATEGORIES} selected={filters} onChange={setFilters} />

      {/* Results */}
      <div className="space-y-2">
        {filtered.length > 0 ? (
          filtered.map((result, idx) => (
            <SearchResultCard key={idx} {...result} />
          ))
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-400">No results found{query ? ` for "${query}"` : ''}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useMemo } from 'react';
import SearchBar from './SearchBar';
import SearchFilters from './SearchFilters';
import SearchResultCard from './SearchResultCard';
const CATEGORIES = [
  { value: 'all', label: 'All' },
  ...[
    'art',
    'music',
    'gaming',
    'sports',
    'photography',
    'brand',
    'membership',
    'ticketing',
    'real_estate',
    'other',
  ].map((c: string) => ({
    value: c,
    label: c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' '),
  })),
];

const TABS: { key: 'all' | 'nfts' | 'collections' | 'creators'; label: string }[] = [
  { key: 'all', label: 'All Results' },
  { key: 'nfts', label: 'NFTs' },
  { key: 'collections', label: 'Collections' },
  { key: 'creators', label: 'Creators' },
];

const MOCK_RESULTS = [
  {
    type: 'nft' as const,
    title: 'Abstract #001',
    subtitle: 'Token #1 in Digital Artworks',
    href: '/explore',
    tags: ['abstract', 'digital'],
    category: 'art',
  },
  {
    type: 'collection' as const,
    title: 'Digital Artworks',
    subtitle: '12 NFTs by GABC...DEFG',
    href: '/collections/1',
    tags: ['art', 'modern'],
    category: 'art',
  },
  {
    type: 'creator' as const,
    title: 'Beza Creator',
    subtitle: '42 NFTs · 5 Collections',
    href: '/creators/GABC123',
    isVerified: true,
    category: 'art',
  },
  {
    type: 'nft' as const,
    title: 'Gaming Sword',
    subtitle: 'Token #4 in Gaming Assets',
    href: '/explore',
    tags: ['rpg', 'weapon'],
    category: 'gaming',
  },
  {
    type: 'collection' as const,
    title: 'Gaming Assets',
    subtitle: '8 NFTs by GXYZ...ABCD',
    href: '/collections/2',
    tags: ['gaming', 'items'],
    category: 'gaming',
  },
  {
    type: 'creator' as const,
    title: 'Pixel Artist',
    subtitle: '15 NFTs · 2 Collections',
    href: '/creators/GXYZ123',
    category: 'gaming',
  },
  {
    type: 'nft' as const,
    title: 'Melody #1',
    subtitle: 'Token #1 in Music Lab',
    href: '/explore',
    tags: ['music', 'audio'],
    category: 'music',
  },
  {
    type: 'collection' as const,
    title: 'Music Lab',
    subtitle: '5 NFTs by GMUS...IC01',
    href: '/collections/3',
    tags: ['music'],
    category: 'music',
  },
];

interface MockResult {
  type: 'nft' | 'collection' | 'creator';
  title: string;
  subtitle: string;
  href: string;
  tags?: string[];
  isVerified?: boolean;
  category?: string;
}

export default function SearchResults() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'nfts' | 'collections' | 'creators'>('all');
  const [filters, setFilters] = useState<string[]>([]);

  const filtered = useMemo(() => {
    let results: MockResult[] = MOCK_RESULTS;

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
      const typeMap: Record<string, string> = {
        nfts: 'nft',
        collections: 'collection',
        creators: 'creator',
      };
      results = results.filter((r) => r.type === typeMap[activeTab]);
    }

    if (filters.length > 0) {
      results = results.filter((r) => r.category && filters.includes(r.category));
    }

    return results;
  }, [query, activeTab, filters]);

  return (
    <div className="space-y-6">
      <SearchBar onSearch={setQuery} initialQuery={query} />

      <div className="flex gap-1 p-1 rounded-xl bg-bezamint-muted/30 border border-bezamint-border w-fit">
        {TABS.map((tab) => (
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

      <div className="space-y-2">
        {filtered.length > 0 ? (
          filtered.map((result, idx) => <SearchResultCard key={idx} {...result} />)
        ) : (
          <div className="card text-center py-12">
            <p className="text-gray-400">No results found{query ? ` for "${query}"` : ''}.</p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import SearchBar from './SearchBar';
import SearchFilters from './SearchFilters';
import SearchResultCard from './SearchResultCard';
import { HiOutlineSearch } from 'react-icons/hi';
import { EmptyState } from '@/components/ui';
import { filterSearchResults, hasCategoryData } from '@/lib/search';
import { useWallet } from '@/context';
import {
  getCreatorProfile,
  getCollectionsByCreator,
  getCollectionById,
  getTokenData,
  isValidStellarAddress,
} from '@/services';

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

interface SearchResult {
  type: 'nft' | 'collection' | 'creator';
  title: string;
  subtitle: string;
  href: string;
  tags?: string[];
  isVerified?: boolean;
  category?: string;
}

export default function SearchResults() {
  const { address, isConnected, connect } = useWallet();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'nfts' | 'collections' | 'creators'>('all');
  const [filters, setFilters] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  const requestSeq = useRef(0);

  const executeSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (!trimmed || !address) return;
      const seq = ++requestSeq.current;
      setIsSearching(true);
      setSearched(false);

      try {
        const found: SearchResult[] = [];

        // Stellar address → creator profile + their collections
        if (isValidStellarAddress(trimmed)) {
          const [profile, colIds] = await Promise.all([
            getCreatorProfile(address, trimmed),
            getCollectionsByCreator(trimmed),
          ]);
          if (seq !== requestSeq.current) return;
          if (profile) {
            found.push({
              type: 'creator',
              title: profile.displayName || 'Unnamed Creator',
              subtitle: `${trimmed.slice(0, 4)}...${trimmed.slice(-4)} · on-chain profile`,
              href: `/creators/${trimmed}`,
              isVerified: profile.isVerified,
            });
          }
          for (const colId of colIds) {
            found.push({
              type: 'collection',
              title: `Collection #${colId}`,
              subtitle: `By ${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`,
              href: `/collections/${colId}`,
            });
          }
        }

        // Numeric → collection and/or token IDs
        if (/^\d+$/.test(trimmed)) {
          const numeric = Number(trimmed);
          const [col, token] = await Promise.all([
            getCollectionById(address, numeric),
            getTokenData(address, numeric),
          ]);
          if (seq !== requestSeq.current) return;
          if (col) {
            found.push({
              type: 'collection',
              title: `Collection #${numeric}`,
              subtitle: `${col.nft_count ?? 0} NFTs on-chain`,
              href: `/collections/${numeric}`,
            });
          }
          if (token) {
            found.push({
              type: 'nft',
              title: `Token #${numeric}`,
              subtitle: 'On-chain NFT',
              href: `/nft/${numeric}`,
            });
          }
        }

        if (seq !== requestSeq.current) return;
        setResults(found);
      } catch {
        if (seq === requestSeq.current) setResults([]);
      } finally {
        if (seq === requestSeq.current) {
          setIsSearching(false);
          setSearched(true);
        }
      }
    },
    [address],
  );

  // Run search when the query is submitted or the user is connected.
  useEffect(() => {
    if (isConnected && address) {
      executeSearch(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  const filtered = useMemo(
    () => filterSearchResults(results, activeTab, filters),
    [results, activeTab, filters],
  );

  const showCategoryFilters = useMemo(() => hasCategoryData(results), [results]);

  if (!isConnected || !address) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-400 mb-4">
          Connect your Freighter wallet to search on-chain creators, collections, and NFTs.
        </p>
        <button onClick={connect} className="btn-primary text-sm">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SearchBar onSearch={(q) => executeSearch(q)} initialQuery={query} />

      <p className="text-xs text-gray-500">
        Search by a Stellar address (G...), a collection ID, or a token ID. Full-text search will be
        enabled once the on-chain indexer ships.
      </p>

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

      {showCategoryFilters ? (
        <SearchFilters categories={CATEGORIES} selected={filters} onChange={setFilters} />
      ) : (
        <p className="text-xs text-gray-600">
          Category filters appear once results carry category data.
        </p>
      )}

      <div className="space-y-2">
        {isSearching ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card-interactive animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-bezamint-muted/40" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 bg-bezamint-muted/40 rounded" />
                    <div className="h-3 w-1/2 bg-bezamint-muted/30 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          filtered.map((result, idx) => <SearchResultCard key={idx} {...result} />)
        ) : searched ? (
          <EmptyState
            icon={HiOutlineSearch}
            title={`No results found${query ? ` for "${query}"` : ''}`}
            description="Try a full Stellar address (starts with G), a collection ID, or a token ID."
          />
        ) : (
          <EmptyState
            icon={HiOutlineSearch}
            title="Search BezaMint"
            description="Enter a Stellar address, collection ID, or token ID to search."
          />
        )}
      </div>
    </div>
  );
}

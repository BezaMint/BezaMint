import { EmptyState } from "@/components/ui";
import { HiOutlineCollection } from "react-icons/hi";
'use client';

import { useState, useMemo } from 'react';
import { HiOutlinePlus, HiOutlineSearch, HiOutlineFilter } from 'react-icons/hi';
import CollectionCard from './CollectionCard';

interface CollectionItem {
  id: string;
  name: string;
  imageUri: string;
  category: string;
  nftCount: number;
  isArchived: boolean;
  createdAt: string;
  tags: string[];
}

interface CollectionGridProps {
  collections: CollectionItem[];
  onCreateClick: () => void;
  isConnected: boolean;
}

const CATEGORY_FILTERS = [
  'all',
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
];

export default function CollectionGrid({
  collections,
  onCreateClick,
  isConnected,
}: CollectionGridProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const filtered = useMemo(() => {
    let result = collections;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) => c.name.toLowerCase().includes(q) || c.tags.some((t) => t.includes(q)),
      );
    }

    if (category !== 'all') {
      result = result.filter((c) => c.category === category);
    }

    if (!showArchived) {
      result = result.filter((c) => !c.isArchived);
    }

    return result;
  }, [collections, search, category, showArchived]);

  if (collections.length === 0) { return <EmptyState icon={HiOutlineCollection} title="No collections yet" description="Create your first collection to get started." />; }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <HiOutlineSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search collections..."
            className="input-field pl-11"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field w-32 text-sm py-2"
          >
            {CATEGORY_FILTERS.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`btn-secondary py-2 px-3 text-sm ${showArchived ? 'border-bezamint-primary/50 text-bezamint-secondary' : ''}`}
            title="Toggle archived"
          >
            <HiOutlineFilter className="w-4 h-4" />
          </button>

          {isConnected && (
            <button
              onClick={onCreateClick}
              className="btn-primary py-2 px-4 text-sm flex items-center gap-2"
            >
              <HiOutlinePlus className="w-4 h-4" />
              New
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((col) => (
            <CollectionCard key={col.id} {...col} />
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <HiOutlineSearch className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">
            {collections.length === 0
              ? 'No collections yet. Create your first one!'
              : 'No collections match your filters.'}
          </p>
        </div>
      )}
    </div>
  );
}

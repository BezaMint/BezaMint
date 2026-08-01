'use client';

import { HiOutlineSearch } from 'react-icons/hi';
import { EmptyState } from '@/components/ui';

export default function ExplorePage() {
  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Explore</h1>
        <p className="text-gray-400 mt-2">Discover NFTs and collections on Stellar</p>
      </div>

      {/* Search Bar */}
      <div className="mb-8">
        <div className="relative max-w-xl">
          <HiOutlineSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search by name, collection, creator, or token ID..."
            className="input-field pl-12"
          />
        </div>
      </div>

      <EmptyState
        icon={HiOutlineSearch}
        title="Explore Coming Soon"
        description="Search and discovery features are being built. Soon you will be able to browse all NFTs minted on the BezaMint platform."
      />
    </div>
  );
}

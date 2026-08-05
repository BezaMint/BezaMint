'use client';

import { HiOutlineSparkles, HiOutlineTrendingUp } from 'react-icons/hi';
import { SearchResults } from '@/components/search';

export default function ExplorePage() {
  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Explore</h1>
        <p className="text-gray-400 mt-2">Discover NFTs, collections, and creators on Stellar</p>
      </div>

      {/* Featured Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="card bg-gradient-to-br from-bezamint-primary/5 to-bezamint-surface border-bezamint-primary/20">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-bezamint-primary/10 border border-bezamint-primary/20">
              <HiOutlineSparkles className="w-5 h-5 text-bezamint-secondary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Recently Minted</h3>
              <p className="text-xs text-gray-400">Browse the latest NFTs minted on BezaMint</p>
            </div>
          </div>
        </div>
        <div className="card bg-gradient-to-br from-blue-500/5 to-bezamint-surface border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <HiOutlineTrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Verified Creators</h3>
              <p className="text-xs text-gray-400">Discover creators verified on the platform</p>
            </div>
          </div>
        </div>
      </div>

      <SearchResults />
    </div>
  );
}

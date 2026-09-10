'use client';

import Link from 'next/link';
import { HiOutlineSparkles, HiOutlineTrendingUp, HiOutlineArrowRight } from 'react-icons/hi';
import { SearchResults } from '@/components/search';

export default function ExplorePage() {
  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Explore</h1>
        <p className="text-gray-400 mt-2">Discover NFTs, collections, and creators on Stellar</p>
      </div>

      {/* Featured Row — wired to real destinations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link
          href="/collections"
          className="card group bg-gradient-to-br from-bezamint-primary/5 to-bezamint-surface border-bezamint-primary/20 hover:border-bezamint-primary/50"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-bezamint-primary/10 border border-bezamint-primary/20">
              <HiOutlineSparkles className="w-5 h-5 text-bezamint-secondary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white group-hover:text-bezamint-secondary transition-colors">
                Recently Minted
              </h3>
              <p className="text-xs text-gray-400">Browse the latest NFTs minted on BezaMint</p>
            </div>
            <HiOutlineArrowRight className="w-4 h-4 text-gray-600 group-hover:text-bezamint-secondary transition-colors" />
          </div>
        </Link>
        <Link
          href="/verify"
          className="card group bg-gradient-to-br from-blue-500/5 to-bezamint-surface border-blue-500/20 hover:border-blue-500/50"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <HiOutlineTrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                Verified Creators
              </h3>
              <p className="text-xs text-gray-400">Discover creators verified on the platform</p>
            </div>
            <HiOutlineArrowRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
          </div>
        </Link>
        <Link
          href="/mint"
          className="card group bg-gradient-to-br from-purple-500/5 to-bezamint-surface border-purple-500/20 hover:border-purple-500/50"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <HiOutlineSparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white group-hover:text-purple-400 transition-colors">
                Mint Your First NFT
              </h3>
              <p className="text-xs text-gray-400">Create and mint an NFT on Stellar in minutes</p>
            </div>
            <HiOutlineArrowRight className="w-4 h-4 text-gray-600 group-hover:text-purple-400 transition-colors" />
          </div>
        </Link>
      </div>

      <SearchResults />
    </div>
  );
}

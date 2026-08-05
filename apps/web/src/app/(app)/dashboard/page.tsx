'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  HiOutlineCollection,
  HiOutlinePhotograph,
  HiOutlineCurrencyDollar,
  HiOutlineUserGroup,
  HiOutlinePlusCircle,
  HiOutlineShoppingBag,
  HiOutlineShieldCheck,
} from 'react-icons/hi';
import { StatCard } from '@/components/ui';
import { ActivityTimeline } from '@/components/activity';
import { useWallet } from '@/context';
import { formatAddress } from '@/services';
import { getTotalSupply, getTotalCollections, getTotalCreators } from '@/services/contracts';

const SAMPLE_ACTIVITIES = [
  {
    id: '1',
    eventType: 'nft_minted',
    description: 'Abstract #001 minted in collection Digital Artworks',
    timestamp: 'Just now',
    txHash: 'abc123def4567890123456789012345678901234567890abcd',
  },
  {
    id: '2',
    eventType: 'collection_created',
    description: 'Created collection "Digital Artworks"',
    timestamp: '2h ago',
    txHash: 'def789abc0123456789012345678901234567890123456ef01',
  },
  {
    id: '3',
    eventType: 'profile_created',
    description: 'Creator profile registered on BezaMint',
    timestamp: '1d ago',
    txHash: '012345abcdef78901234567890123456789012345678901234',
    href: '/profile',
  },
  {
    id: '4',
    eventType: 'nft_transferred',
    description: 'Gaming Sword transferred to new owner',
    timestamp: '3d ago',
    txHash: '567890abcdef12345678901234567890123456789012345678',
  },
  {
    id: '5',
    eventType: 'royalty_configured',
    description: 'Set 5% royalty on collection "Music Lab"',
    timestamp: '1w ago',
    txHash: '890123abcdef45678901234567890123456789012345678901',
  },
];

export default function DashboardPage() {
  const { address, isConnected } = useWallet();
  const [stats, setStats] = useState({
    totalSupply: null as number | null,
    totalCollections: null as number | null,
    totalCreators: null as number | null,
  });

  // Fetch real on-chain stats from the deployed contracts.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;

    (async () => {
      const [supply, collections, creators] = await Promise.all([
        getTotalSupply(address),
        getTotalCollections(address),
        getTotalCreators(address),
      ]);
      if (!cancelled) setStats({ totalSupply: supply, totalCollections: collections, totalCreators: creators });
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const statCards = [
    {
      label: 'Total NFTs',
      value: stats.totalSupply !== null ? String(stats.totalSupply) : '—',
      icon: HiOutlinePhotograph,
    },
    {
      label: 'Collections',
      value: stats.totalCollections !== null ? String(stats.totalCollections) : '—',
      icon: HiOutlineCollection,
    },
    { label: 'Royalty Earnings', value: '—', icon: HiOutlineCurrencyDollar },
    {
      label: 'Creators',
      value: stats.totalCreators !== null ? String(stats.totalCreators) : '—',
      icon: HiOutlineUserGroup,
    },
  ];

  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-2">
          {isConnected
            ? `Welcome back, ${formatAddress(address!)}`
            : 'Connect your wallet to get started'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-1">
          <h2 className="section-title text-lg">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              href="/mint"
              className="flex items-center gap-3 p-3 rounded-xl bg-bezamint-primary/10 border border-bezamint-primary/20 hover:bg-bezamint-primary/20 transition-all group"
            >
              <HiOutlinePlusCircle className="w-5 h-5 text-bezamint-secondary" />
              <span className="text-sm font-medium text-gray-200">Mint New NFT</span>
            </Link>
            <Link
              href="/collections"
              className="flex items-center gap-3 p-3 rounded-xl bg-bezamint-muted/50 border border-bezamint-border hover:border-gray-600 transition-all group"
            >
              <HiOutlineCollection className="w-5 h-5 text-gray-400 group-hover:text-gray-200" />
              <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200">
                Manage Collections
              </span>
            </Link>
            <Link
              href="/explore"
              className="flex items-center gap-3 p-3 rounded-xl bg-bezamint-muted/50 border border-bezamint-border hover:border-gray-600 transition-all group"
            >
              <HiOutlineShoppingBag className="w-5 h-5 text-gray-400 group-hover:text-gray-200" />
              <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200">
                Explore NFTs
              </span>
            </Link>
            <Link
              href="/verify"
              className="flex items-center gap-3 p-3 rounded-xl bg-bezamint-muted/50 border border-bezamint-border hover:border-gray-600 transition-all group"
            >
              <HiOutlineShieldCheck className="w-5 h-5 text-gray-400 group-hover:text-gray-200" />
              <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200">
                Verify Ownership
              </span>
            </Link>
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h2 className="section-title text-lg">Recent Activity</h2>
          <ActivityTimeline activities={SAMPLE_ACTIVITIES} maxItems={8} />
        </div>
      </div>
    </div>
  );
}

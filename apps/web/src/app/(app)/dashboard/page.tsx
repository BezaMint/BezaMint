'use client';

import {
  HiOutlineCollection,
  HiOutlinePhotograph,
  HiOutlineCurrencyDollar,
  HiOutlineUserGroup,
  HiOutlineSparkles,
  HiOutlinePlusCircle,
  HiOutlineShoppingBag,
} from 'react-icons/hi';
import { StatCard, ActivityItem } from '@/components/ui';
import { useWallet } from '@/context';
import { formatAddress } from '@/services';

const SAMPLE_STATS = [
  { label: 'Total NFTs', value: '—', icon: HiOutlinePhotograph },
  { label: 'Collections', value: '—', icon: HiOutlineCollection },
  { label: 'Royalty Earnings', value: '—', icon: HiOutlineCurrencyDollar },
  { label: 'Creators', value: '—', icon: HiOutlineUserGroup },
];

const SAMPLE_ACTIVITY = [
  {
    eventType: 'NFT Minted',
    description: 'Created a new NFT on the Stellar testnet',
    timestamp: 'Just now',
    icon: <HiOutlineSparkles className="w-4 h-4 text-bezamint-secondary" />,
  },
  {
    eventType: 'Collection Created',
    description: 'Set up a new collection for digital art',
    timestamp: '2 hours ago',
    icon: <HiOutlineCollection className="w-4 h-4 text-blue-400" />,
  },
  {
    eventType: 'Wallet Connected',
    description: 'Connected Freighter wallet to BezaMint',
    timestamp: '1 day ago',
    icon: <HiOutlineUserGroup className="w-4 h-4 text-yellow-400" />,
  },
];

export default function DashboardPage() {
  const { address, isConnected } = useWallet();

  return (
    <div className="page-container max-w-6xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-2">
          {isConnected
            ? `Welcome back, ${formatAddress(address!)}`
            : 'Connect your wallet to get started'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {SAMPLE_STATS.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
          />
        ))}
      </div>

      {/* Quick Actions + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="card lg:col-span-1">
          <h2 className="section-title text-lg">Quick Actions</h2>
          <div className="space-y-2">
            <a href="/mint" className="flex items-center gap-3 p-3 rounded-xl bg-bezamint-primary/10 border border-bezamint-primary/20 hover:bg-bezamint-primary/20 transition-all group">
              <HiOutlinePlusCircle className="w-5 h-5 text-bezamint-secondary" />
              <span className="text-sm font-medium text-gray-200">Mint New NFT</span>
            </a>
            <a href="/collections" className="flex items-center gap-3 p-3 rounded-xl bg-bezamint-muted/50 border border-bezamint-border hover:border-gray-600 transition-all group">
              <HiOutlineCollection className="w-5 h-5 text-gray-400 group-hover:text-gray-200" />
              <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200">
                Manage Collections
              </span>
            </a>
            <a href="/explore" className="flex items-center gap-3 p-3 rounded-xl bg-bezamint-muted/50 border border-bezamint-border hover:border-gray-600 transition-all group">
              <HiOutlineShoppingBag className="w-5 h-5 text-gray-400 group-hover:text-gray-200" />
              <span className="text-sm font-medium text-gray-400 group-hover:text-gray-200">
                Explore NFTs
              </span>
            </a>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card lg:col-span-2">
          <h2 className="section-title text-lg">Recent Activity</h2>
          <div className="space-y-1">
            {SAMPLE_ACTIVITY.map((activity, idx) => (
              <ActivityItem key={idx} {...activity} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

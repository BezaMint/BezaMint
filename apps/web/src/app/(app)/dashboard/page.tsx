'use client';

import { useEffect, useState, useMemo } from 'react';
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
import { xdr, scValToNative } from '@stellar/stellar-sdk';
import { StatCard, EmptyState } from '@/components/ui';
import { ActivityTimeline } from '@/components/activity';
import { useWallet } from '@/context';
import { useContractEvents } from '@/hooks/useContractEvents';
import type { ActivityItem } from '@/components/activity/ActivityTimeline';
import { formatAddress, CONTRACT_IDS } from '@/services';
import { getTotalSupply, getTotalCollections, getTotalCreators } from '@/services/contracts';

// ─────────────────────── Event decoding ───────────────────────

/**
 * Decode the Factory event variant from its topic XDR so real activity can
 * be labeled (NftMinted / CollectionCreated / ContractsSet) instead of shown
 * as an opaque blob.
 */
function decodeFactoryEventType(topics: string[]): string {
  const topic = topics[1];
  if (!topic) return 'contract_event';
  try {
    const variant = xdr.ScVal.fromXDR(topic, 'base64');
    const v = scValToNative(variant);
    if (typeof v === 'number') {
      const NAMES = ['NftMinted', 'CollectionCreated', 'ContractsSet'];
      return NAMES[v] ?? 'contract_event';
    }
  } catch {
    // unparseable topic — fall through
  }
  return 'contract_event';
}

function eventToActivity(event: {
  pagingToken: string;
  topics: string[];
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
}): ActivityItem {
  const type = decodeFactoryEventType(event.topics);
  const eventType =
    type === 'NftMinted'
      ? 'nft_minted'
      : type === 'CollectionCreated'
        ? 'collection_created'
        : 'contract_event';
  return {
    id: event.pagingToken,
    eventType,
    description:
      type === 'NftMinted'
        ? 'An NFT was minted through the BezaMint Factory'
        : type === 'CollectionCreated'
          ? 'A collection was created through the BezaMint Factory'
          : `On-chain event (ledger ${event.ledger})`,
    timestamp: event.ledgerClosedAt
      ? new Date(event.ledgerClosedAt).toLocaleString()
      : `Ledger ${event.ledger}`,
    txHash: event.txHash,
  };
}

export default function DashboardPage() {
  const { address, isConnected, connect } = useWallet();
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
      if (!cancelled)
        setStats({ totalSupply: supply, totalCollections: collections, totalCreators: creators });
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  // Real activity from the Factory contract's emitted events.
  const { events: contractEvents, isLoading: eventsLoading } = useContractEvents({
    contractIds: isConnected && CONTRACT_IDS.factory ? [CONTRACT_IDS.factory] : undefined,
    pollIntervalMs: 15000,
    maxEvents: 20,
  });

  const activities = useMemo(() => {
    return contractEvents.map(eventToActivity).slice(0, 8);
  }, [contractEvents]);

  const statsLoading =
    stats.totalSupply === null && stats.totalCollections === null && stats.totalCreators === null;

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

  if (!isConnected) {
    return (
      <div className="page-container max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-2">Connect your wallet to get started</p>
        </div>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bezamint-muted/50 border border-bezamint-border mb-4">
            <HiOutlineShieldCheck className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">Connect Your Wallet</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
            Connect your Freighter wallet to see your NFTs, collections, and on-chain activity.
          </p>
          <button onClick={connect} className="btn-primary text-sm">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-2">Welcome back, {formatAddress(address!)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            icon={stat.icon}
            loading={statsLoading}
          />
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
          {eventsLoading && activities.length === 0 ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-bezamint-muted/30 rounded animate-pulse" />
              ))}
            </div>
          ) : activities.length === 0 ? (
            <EmptyState
              icon={HiOutlineShoppingBag}
              title="No activity yet"
              description="Mint an NFT or create a collection to see on-chain activity here."
              actionLabel="Mint an NFT"
              actionHref="/mint"
            />
          ) : (
            <ActivityTimeline activities={activities} maxItems={8} />
          )}
        </div>
      </div>
    </div>
  );
}

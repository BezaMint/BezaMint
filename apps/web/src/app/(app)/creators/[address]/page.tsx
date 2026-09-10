'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { HiOutlineArrowLeft, HiOutlineCollection, HiOutlineSparkles } from 'react-icons/hi';
import { CreatorProfileHeader } from '@/components/profile';
import { EmptyState } from '@/components/ui';
import { useWallet } from '@/context';
import { getCreatorProfile, getCollectionsByCreator, isValidStellarAddress } from '@/services';

export default function CreatorShowcasePage() {
  const { address } = useParams<{ address: string }>();
  const router = useRouter();
  const { address: walletAddress, isConnected, connect } = useWallet();

  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getCreatorProfile>> | null>(
    null,
  );
  const [collectionIds, setCollectionIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || typeof address !== 'string') return;
    if (!isValidStellarAddress(address)) {
      setError('This is not a valid Stellar address.');
      setIsLoading(false);
      return;
    }
    if (!isConnected || !walletAddress) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const [prof, ids] = await Promise.all([
          getCreatorProfile(walletAddress, address),
          getCollectionsByCreator(address),
        ]);
        if (cancelled) return;
        setProfile(prof);
        setCollectionIds(ids);
      } catch {
        if (!cancelled) setError('Failed to load creator profile. Please try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, walletAddress, isConnected]);

  if (!isConnected || !walletAddress) {
    return (
      <div className="page-container max-w-6xl">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-gray-400 mb-4">
            Connect your Freighter wallet to view creator profiles on the Stellar network.
          </p>
          <button onClick={connect} className="btn-primary text-sm">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-container max-w-6xl">
        <div className="h-48 lg:h-64 rounded-2xl bg-bezamint-muted/40 animate-pulse mb-8" />
        <div className="flex gap-6 mb-10">
          <div className="w-24 h-24 rounded-2xl bg-bezamint-muted/40 animate-pulse" />
          <div className="flex-1 space-y-3">
            <div className="h-7 w-64 bg-bezamint-muted/40 rounded animate-pulse" />
            <div className="h-4 w-40 bg-bezamint-muted/30 rounded animate-pulse" />
            <div className="h-4 w-72 bg-bezamint-muted/30 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page-container max-w-6xl">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          Back
        </button>
        <EmptyState
          icon={HiOutlineSparkles}
          title="Creator not found"
          description={
            error ||
            'This address does not have a registered creator profile yet. They can register from the Profile page.'
          }
        />
      </div>
    );
  }

  return (
    <div className="page-container max-w-6xl">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
      >
        <HiOutlineArrowLeft className="w-4 h-4" />
        Back
      </button>

      <CreatorProfileHeader
        profile={{
          address: profile.address,
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUri: profile.avatarUri,
          bannerUri: profile.bannerUri,
          socialLinks: profile.socialLinks,
          createdAt: Date.now() / 1000,
          updatedAt: Date.now() / 1000,
          isVerified: profile.isVerified,
          totalNftsCreated: 0,
          totalCollections: collectionIds.length,
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineSparkles className="w-5 h-5 text-bezamint-secondary" />
            <h2 className="text-lg font-semibold text-white">Created NFTs</h2>
          </div>
          <p className="text-sm text-gray-500">
            NFT listings for this creator will appear here once the on-chain indexer is live
            (tracked in the improvement plan).
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineCollection className="w-5 h-5 text-bezamint-secondary" />
            <h2 className="text-lg font-semibold text-white">Collections</h2>
          </div>
          {collectionIds.length > 0 ? (
            <div className="space-y-3">
              {collectionIds.map((id) => (
                <Link
                  key={id}
                  href={`/collections/${id}`}
                  className="flex items-center gap-3 p-2 rounded-lg bg-bezamint-muted/30 border border-bezamint-border hover:border-bezamint-primary/40 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-bezamint-muted/50 flex items-center justify-center">
                    <HiOutlineCollection className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-200">Collection #{id}</p>
                    <p className="text-xs text-gray-500">View on-chain</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500">No collections created yet.</p>
          )}
          <p className="text-xs text-gray-500 mt-4">{collectionIds.length} collections total</p>
        </div>
      </div>
    </div>
  );
}

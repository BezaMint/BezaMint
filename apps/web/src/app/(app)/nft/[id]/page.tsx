'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  HiOutlineArrowLeft,
  HiOutlinePhotograph,
  HiOutlineSparkles,
  HiOutlineUser,
  HiOutlineCollection,
  HiOutlineCurrencyDollar,
  HiOutlineLockClosed,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import { EmptyState, LoadingSkeleton, SmartImage } from '@/components/ui';
import { formatBasisPoints } from '@bezamint/shared';
import { resolveMetadataUri } from '@/lib/metadataResolver';
import { useWallet } from '@/context';
import {
  getTokenData,
  getOwnerOf,
  getRoyaltyConfig,
  getCollectionForNft,
  getExplorerAccountUrl,
  formatAddress,
} from '@/services';

export default function NftDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { address, isConnected, connect } = useWallet();

  const [token, setToken] = useState<Awaited<ReturnType<typeof getTokenData>> | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [royalty, setRoyalty] = useState<Awaited<ReturnType<typeof getRoyaltyConfig>> | null>(null);
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [resolvedMeta, setResolvedMeta] = useState<Awaited<
    ReturnType<typeof resolveMetadataUri>
  > | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address || !id || typeof id !== 'string') return;
    const tokenId = Number(id);
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    try {
      const [data, ownerAddr, royaltyCfg, colId] = await Promise.all([
        getTokenData(address, tokenId),
        getOwnerOf(address, tokenId),
        getRoyaltyConfig(address, tokenId),
        getCollectionForNft(address, tokenId),
      ]);
      if (cancelled) return;
      setToken(data);
      setOwner(ownerAddr);
      setRoyalty(royaltyCfg);
      setCollectionId(colId);
      if (data) {
        // Best-effort resolve the metadata JSON (name, description, image).
        resolveMetadataUri(data.metadataUri)
          .then((meta) => {
            if (!cancelled) setResolvedMeta(meta);
          })
          .catch(() => {
            if (!cancelled) setResolvedMeta(null);
          });
      } else {
        setError('This token does not exist on-chain.');
      }
    } catch {
      if (!cancelled) setError('Failed to load this NFT. Please try again.');
    } finally {
      if (!cancelled) setIsLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [address, id]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, id]);

  if (!isConnected || !address) {
    return (
      <div className="page-container max-w-4xl">
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          Back to Explore
        </Link>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-gray-400 mb-4">
            Connect your Freighter wallet to view NFT details on the Stellar network.
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
      <div className="page-container max-w-4xl">
        <LoadingSkeleton className="h-8 w-40 mb-6" />
        <div className="card">
          <div className="flex flex-col sm:flex-row gap-8">
            <div className="w-full sm:w-64 aspect-square bg-bezamint-muted/40 animate-pulse rounded-xl" />
            <div className="flex-1 space-y-4 py-2">
              <div className="h-8 w-1/2 bg-bezamint-muted/40 rounded" />
              <div className="h-4 w-3/4 bg-bezamint-muted/30 rounded" />
              <div className="h-4 w-2/3 bg-bezamint-muted/30 rounded" />
              <div className="h-4 w-1/2 bg-bezamint-muted/30 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="page-container max-w-4xl">
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          Back to Explore
        </Link>
        <EmptyState
          icon={HiOutlinePhotograph}
          title="NFT not found"
          description={error || 'This token does not exist on-chain.'}
          actionLabel="Browse explore"
          actionHref="/explore"
        />
      </div>
    );
  }

  const royaltyPercent = formatBasisPoints(royalty?.basisPoints ?? 0);

  return (
    <div className="page-container max-w-4xl">
      <Link
        href="/explore"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
      >
        <HiOutlineArrowLeft className="w-4 h-4" />
        Back to Explore
      </Link>

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-8">
          <div className="w-full sm:w-64 flex-shrink-0">
            <div className="aspect-square rounded-xl bg-bezamint-muted/50 border border-bezamint-border overflow-hidden">
              <SmartImage
                src={resolvedMeta?.image}
                alt={resolvedMeta?.name || `Token #${token.tokenId}`}
                className="w-full h-full"
                fallback={<HiOutlinePhotograph className="w-12 h-12 text-gray-600" />}
              />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">
                {resolvedMeta?.name || `Token #${token.tokenId}`}
              </h1>
              <span className="badge-primary">NFT</span>
            </div>
            {resolvedMeta?.description && (
              <p className="text-sm text-gray-400 leading-relaxed mb-3">
                {resolvedMeta.description.slice(0, 240)}
              </p>
            )}

            {/* Creator */}
            <div className="flex items-center gap-3 text-sm mb-3">
              <HiOutlineUser className="w-4 h-4 text-gray-500" />
              <span className="text-gray-400">Creator</span>
              <a
                href={getExplorerAccountUrl(token.creator)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-bezamint-secondary hover:underline flex items-center gap-1"
              >
                {formatAddress(token.creator)}
                <HiOutlineExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Owner */}
            {owner && (
              <div className="flex items-center gap-3 text-sm mb-3">
                <HiOutlineUser className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Owner</span>
                <a
                  href={getExplorerAccountUrl(owner)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-bezamint-secondary hover:underline flex items-center gap-1"
                >
                  {formatAddress(owner)}
                  <HiOutlineExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Collection */}
            {collectionId && collectionId > 0 ? (
              <div className="flex items-center gap-3 text-sm mb-3">
                <HiOutlineCollection className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Collection</span>
                <Link
                  href={`/collections/${collectionId}`}
                  className="text-bezamint-secondary hover:underline"
                >
                  Collection #{collectionId}
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm mb-3">
                <HiOutlineCollection className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Not in a collection</span>
              </div>
            )}

            {/* Royalty */}
            <div className="flex items-center gap-3 text-sm mb-4">
              <HiOutlineCurrencyDollar className="w-4 h-4 text-yellow-400" />
              <span className="text-gray-400">Royalty</span>
              {royalty ? (
                <span className="flex items-center gap-2">
                  <span className="text-white font-semibold">{royaltyPercent}%</span>
                  {royalty.isFrozen && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <HiOutlineLockClosed className="w-3 h-3" /> Frozen
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-gray-500">None configured</span>
              )}
            </div>

            {/* Metadata URI */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">Metadata URI</p>
              <p className="text-xs font-mono text-gray-400 break-all bg-bezamint-muted/30 rounded-lg p-3 border border-bezamint-border">
                {token.metadataUri}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/mint" className="btn-primary text-sm">
                <HiOutlineSparkles className="w-4 h-4" /> Mint Your Own
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  HiOutlinePhotograph,
  HiOutlinePencil,
  HiOutlineArchive,
  HiOutlineLockClosed,
  HiOutlineSparkles,
  HiOutlineArrowLeft,
  HiOutlineClock,
} from 'react-icons/hi';
import { CollectionForm } from '@/components/collection';
import { EmptyState, LoadingSkeleton } from '@/components/ui';
import { useWallet } from '@/context';
import { useToast } from '@/context';
import { useTransaction } from '@/hooks/useTransaction';
import {
  getCollectionById,
  getNftsInCollection,
  updateCollection,
  archiveCollection,
  signAndSubmit,
  uploadMetadataToIpfs,
} from '@/services';
import type { CollectionFormState, CollectionCategory } from '@bezamint/shared';

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { address, isConnected, connect } = useWallet();
  const { showSuccess } = useToast();
  const tx = useTransaction();

  const [collection, setCollection] = useState<Record<string, unknown> | null>(null);
  const [nftIds, setNftIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!address || !id || typeof id !== 'string') return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    try {
      const [col, nfts] = await Promise.all([
        getCollectionById(address, Number(id)),
        getNftsInCollection(address, Number(id)),
      ]);
      if (cancelled) return;
      if (!col) {
        setError('Collection not found on-chain.');
        setCollection(null);
      } else {
        setCollection(col);
        setNftIds(nfts);
      }
    } catch {
      if (!cancelled) setError('Failed to load this collection. Please try again.');
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

  const handleEdit = async (data: CollectionFormState) => {
    if (!address || !collection) return;
    try {
      await tx.execute(async (onStatus) => {
        onStatus('uploading');
        const { ipfsUri } = await uploadMetadataToIpfs({
          name: data.name,
          description: data.description,
          imageUri: data.imageUri,
          externalUrl: data.externalUrl,
          attributes: [],
          collectionId: String(collection.id ?? id),
        });
        onStatus('preparing');
        const txXdr = await updateCollection(address, Number(id), ipfsUri);
        onStatus('signing');
        const result = await signAndSubmit(txXdr, (s) => onStatus(s as never));
        return { txHash: result.txHash };
      });
      showSuccess('Collection updated!');
      setIsEditing(false);
      load();
    } catch {
      // Errors surfaced by useTransaction
    }
  };

  const toggleArchive = async () => {
    if (!address || !collection || isArchiving) return;
    setIsArchiving(true);
    try {
      await tx.execute(async (onStatus) => {
        onStatus('preparing');
        const txXdr = await archiveCollection(address, Number(id));
        onStatus('signing');
        const result = await signAndSubmit(txXdr, (s) => onStatus(s as never));
        return { txHash: result.txHash };
      });
      showSuccess(collection.is_archived ? 'Collection unarchived!' : 'Collection archived!');
      load();
    } catch {
      // Errors surfaced by useTransaction
    } finally {
      setIsArchiving(false);
    }
  };

  if (!isConnected || !address) {
    return (
      <div className="page-container max-w-6xl">
        <Link
          href="/collections"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          Back to Collections
        </Link>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-gray-400 mb-4">
            Connect your Freighter wallet to view collections on the Stellar network.
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
        <LoadingSkeleton className="h-8 w-40 mb-6" />
        <div className="card mb-8 overflow-hidden">
          <div className="lg:flex gap-8">
            <div className="w-full lg:w-80 aspect-square bg-bezamint-muted/40 animate-pulse rounded-xl" />
            <div className="flex-1 space-y-4 py-4">
              <div className="h-8 w-2/3 bg-bezamint-muted/40 rounded" />
              <div className="h-4 w-1/2 bg-bezamint-muted/30 rounded" />
              <div className="h-4 w-full bg-bezamint-muted/30 rounded" />
              <div className="h-4 w-5/6 bg-bezamint-muted/30 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div className="page-container max-w-6xl">
        <Link
          href="/collections"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
        >
          <HiOutlineArrowLeft className="w-4 h-4" />
          Back to Collections
        </Link>
        <EmptyState
          icon={HiOutlinePhotograph}
          title="Collection not found"
          description={error || 'This collection does not exist on-chain.'}
          actionLabel="Browse collections"
          actionHref="/collections"
        />
      </div>
    );
  }

  const collectionId = String(collection.id ?? id);
  const nftCount = Number(collection.nft_count ?? nftIds.length);
  const isArchived = Boolean(collection.is_archived);
  const createdAt = Number(collection.created_at ?? 0);
  const metadataUri = String(collection.metadata_uri ?? '');

  return (
    <div className="page-container max-w-6xl">
      {/* Back navigation */}
      <Link
        href="/collections"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
      >
        <HiOutlineArrowLeft className="w-4 h-4" />
        Back to Collections
      </Link>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto animate-fade-in">
            <CollectionForm
              key={String(isEditing)}
              onSubmit={handleEdit}
              onCancel={() => setIsEditing(false)}
              isSubmitting={tx.isPending}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="card mb-8 overflow-hidden">
        <div className="lg:flex gap-8">
          <div className="w-full lg:w-80 flex-shrink-0 mb-6 lg:mb-0">
            <div className="aspect-square rounded-xl bg-bezamint-muted/50 border border-bezamint-border overflow-hidden">
              {metadataUri ? (
                <img
                  src={metadataUri}
                  alt={`Collection ${collectionId}`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <HiOutlinePhotograph className="w-12 h-12 text-gray-600" />
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-white">Collection #{collectionId}</h1>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
                  <span>{nftCount} NFTs</span>
                  {isArchived && (
                    <span className="badge inline-flex items-center gap-1 bg-red-500/20 text-red-400">
                      <HiOutlineLockClosed className="w-3 h-3" />
                      Archived
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={isArchived || tx.isPending}
                  className="btn-secondary py-2 px-3 text-sm flex items-center gap-1 disabled:opacity-40"
                >
                  <HiOutlinePencil className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={toggleArchive}
                  disabled={tx.isPending}
                  className={`py-2 px-3 text-sm rounded-xl font-semibold border transition-all flex items-center gap-1 disabled:opacity-40 ${
                    isArchived
                      ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                      : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20'
                  }`}
                >
                  <HiOutlineArchive className="w-4 h-4" />
                  {isArchiving ? 'Submitting...' : isArchived ? 'Unarchive' : 'Archive'}
                </button>
              </div>
            </div>

            <p className="text-gray-400 leading-relaxed mb-4 font-mono text-xs break-all">
              {metadataUri}
            </p>

            <div className="flex items-center gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <HiOutlineClock className="w-3 h-3" />
                {createdAt > 0
                  ? `Created ${new Date(createdAt * 1000).toLocaleDateString()}`
                  : 'Creation date on-chain'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* NFTs in Collection */}
      <div>
        <h2 className="section-title text-lg">NFTs in this Collection</h2>
        {nftIds.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {nftIds.map((tokenId) => (
              <Link key={tokenId} href={`/nft/${tokenId}`} className="card-interactive">
                <div className="aspect-square rounded-lg bg-bezamint-muted/50 border border-bezamint-border flex items-center justify-center mb-3">
                  <HiOutlineSparkles className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-sm font-medium text-gray-200">Token #{tokenId}</p>
                <p className="text-xs text-gray-500">View details</p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={HiOutlineSparkles}
            title="No NFTs in this collection yet"
            description="Mint an NFT into this collection to see it here."
            actionLabel="Mint an NFT"
            actionHref="/mint"
          />
        )}
      </div>
    </div>
  );
}

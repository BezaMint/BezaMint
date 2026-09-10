'use client';

import { useState, useCallback, useEffect } from 'react';
import type { CollectionFormState } from '@bezamint/shared';
import { CollectionGrid, CollectionForm } from '@/components/collection';
import { useWallet } from '@/context';
import { useToast } from '@/context';
import { getCollectionsByCreator, createCollection, signAndSubmit } from '@/services/contracts';
import { uploadMetadataToIpfs } from '@/services';

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

// Demo fallback data used when no wallet is connected or the contract is unreachable.
const SAMPLE_COLLECTIONS: CollectionItem[] = [
  {
    id: '1',
    name: 'Digital Artworks',
    imageUri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400',
    category: 'art',
    nftCount: 12,
    isArchived: false,
    createdAt: '2 days ago',
    tags: ['abstract', 'digital', 'modern'],
  },
  {
    id: '2',
    name: 'Gaming Assets',
    imageUri: 'https://images.unsplash.com/photo-1552820728-8b83bb6b2cf7?w=400',
    category: 'gaming',
    nftCount: 8,
    isArchived: false,
    createdAt: '5 days ago',
    tags: ['rpg', 'items', 'weapons'],
  },
];

export default function CollectionsPage() {
  const { isConnected, connect, address } = useWallet();
  const { showSuccess, showError } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [collections, setCollections] = useState<CollectionItem[]>(SAMPLE_COLLECTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load real on-chain collections for the connected wallet.
  useEffect(() => {
    if (!isConnected || !address) {
      setCollections(SAMPLE_COLLECTIONS);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const ids = await getCollectionsByCreator(address);
      if (cancelled) return;

      if (ids.length > 0) {
        setCollections(
          ids.map((id, i) => ({
            id: String(id),
            name: `Collection #${id}`,
            imageUri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400',
            category: 'art',
            nftCount: 0,
            isArchived: false,
            createdAt: `${i + 1} on-chain`,
            tags: ['on-chain'],
          })),
        );
      } else {
        // No collections on-chain yet — show empty demo grid with samples hidden.
        setCollections([]);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const handleCreate = useCallback(
    async (data: CollectionFormState) => {
      if (!isConnected || !address) return;
      setIsSubmitting(true);

      // Optimistic insert so the UI feels instant; rolled back on failure.
      const pendingId = `pending-${Date.now()}`;
      const optimistic: CollectionItem = {
        id: pendingId,
        name: data.name,
        imageUri: data.imageUri,
        category: data.category,
        nftCount: 0,
        isArchived: false,
        createdAt: 'Creating...',
        tags: data.tags,
      };
      setCollections((prev) => [optimistic, ...prev]);

      try {
        // Upload metadata, then create the collection on-chain via the Factory.
        const { ipfsUri } = await uploadMetadataToIpfs({
          name: data.name,
          description: data.description,
          imageUri: data.imageUri,
          externalUrl: data.externalUrl,
          attributes: [],
        });
        const txXdr = await createCollection(address, ipfsUri);
        const result = await signAndSubmit(txXdr);
        if (!result.txHash) throw new Error('Collection creation failed');

        // Resolve the real ID from the refreshed on-chain list.
        const ids = await getCollectionsByCreator(address);
        const newId = ids.length > 0 ? Math.max(...ids) : 0;
        if (newId === 0) throw new Error('Could not resolve new collection ID');

        setCollections((prev) =>
          prev.map((c) =>
            c.id === pendingId
              ? { ...c, id: String(newId), name: data.name, createdAt: 'Just now' }
              : c,
          ),
        );
        setShowCreate(false);
        showSuccess(`Collection "${data.name}" created!`);
      } catch (err: unknown) {
        // Roll back the optimistic entry.
        setCollections((prev) => prev.filter((c) => c.id !== pendingId));
        showError((err as Error)?.message || 'Failed to create collection');
      } finally {
        setIsSubmitting(false);
      }
    },
    [isConnected, address, showSuccess, showError],
  );

  if (!isConnected) {
    return (
      <div className="page-container max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Collections</h1>
          <p className="text-gray-400 mt-2">Connect your wallet to manage collections</p>
        </div>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <p className="text-gray-400 mb-4">
            Connect your Freighter wallet to view and manage your NFT collections.
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
        <h1 className="text-3xl font-bold text-white">Collections</h1>
        <p className="text-gray-400 mt-2">
          Manage your NFT collections ({collections.length} total)
        </p>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="card max-w-lg w-full max-h-[90vh] overflow-y-auto animate-fade-in">
            <CollectionForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreate(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="w-full aspect-video bg-bezamint-muted/40 rounded-lg mb-4" />
              <div className="h-5 w-3/4 bg-bezamint-muted/40 rounded mb-2" />
              <div className="h-4 w-1/2 bg-bezamint-muted/30 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <CollectionGrid
          collections={collections}
          onCreateClick={() => setShowCreate(true)}
          isConnected={isConnected}
        />
      )}
    </div>
  );
}

'use client';

import { useState, useCallback } from 'react';
import type { CollectionFormState } from '@bezamint/shared';
import { CollectionGrid, CollectionForm } from '@/components/collection';
import { useWallet } from '@/context';
import { useToast } from '@/context';

// Mock data — in production, fetch from contract
const SAMPLE_COLLECTIONS = [
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

// Show loading skeleton initially
useState(() => {
  const t = setTimeout(() => setIsLoading(false), 100);
  return () => clearTimeout(t);
});

export default function CollectionsPage() {
  const { isConnected, connect } = useWallet();
  const { showSuccess } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [collections, setCollections] = useState(SAMPLE_COLLECTIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = useCallback(
    async (data: CollectionFormState) => {
      setIsSubmitting(true);
      // In production: call collection contract to create collection
      await new Promise((r) => setTimeout(r, 1500));

      const newCollection = {
        id: String(collections.length + 1),
        name: data.name,
        imageUri: data.imageUri,
        category: data.category,
        nftCount: 0,
        isArchived: false,
        createdAt: 'Just now',
        tags: data.tags,
      };

      setCollections((prev) => [newCollection, ...prev]);
      setIsSubmitting(false);
      setShowCreate(false);
      showSuccess(`Collection "${data.name}" created!`);
    },
    [collections.length, showSuccess],
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

      <CollectionGrid
        collections={collections}
        onCreateClick={() => setShowCreate(true)}
        isConnected={isConnected}
      />
    </div>
  );
}

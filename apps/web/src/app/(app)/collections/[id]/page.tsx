'use client';

import { useState } from 'react';
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
  HiOutlineTag,
} from 'react-icons/hi';
import { CollectionForm } from '@/components/collection';
import type { CollectionFormState, CollectionCategory } from '@bezamint/shared';

// Mock data
const MOCK_COLLECTION = {
  id: '1',
  name: 'Digital Artworks',
  description: 'A collection of modern digital artworks exploring abstract themes and generative patterns.',
  imageUri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
  externalUrl: 'https://example.com/collection',
  category: 'art',
  nftCount: 12,
  isArchived: false,
  createdAt: '2025-03-15',
  updatedAt: '2025-04-01',
  tags: ['abstract', 'digital', 'modern'],
  nfts: [
    { tokenId: 1, name: 'Abstract #001' },
    { tokenId: 2, name: 'Abstract #002' },
    { tokenId: 3, name: 'Abstract #003' },
  ],
};

export default function CollectionDetailPage() {
  const { id } = useParams();
  const [collection, setCollection] = useState(MOCK_COLLECTION);
  const [isEditing, setIsEditing] = useState(false);

  const handleEdit = (data: CollectionFormState) => {
    setCollection((prev) => ({
      ...prev,
      name: data.name,
      description: data.description,
      imageUri: data.imageUri,
      externalUrl: data.externalUrl,
      category: data.category,
      tags: data.tags,
    }));
    setIsEditing(false);
  };

  const toggleArchive = () => {
    setCollection((prev) => ({ ...prev, isArchived: !prev.isArchived }));
  };

  return (
    <div className="page-container max-w-6xl">
      {/* Back navigation */}
      <Link href="/collections" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors">
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
              initialData={{
                name: collection.name,
                description: collection.description,
                imageUri: collection.imageUri,
                externalUrl: collection.externalUrl,
                category: collection.category as CollectionCategory,
                tags: collection.tags,
              }}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="card mb-8 overflow-hidden">
        <div className="lg:flex gap-8">
          {/* Image */}
          <div className="w-full lg:w-80 flex-shrink-0 mb-6 lg:mb-0">
            <div className="aspect-square rounded-xl bg-bezamint-muted/50 border border-bezamint-border overflow-hidden">
              {collection.imageUri ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={collection.imageUri} alt={collection.name}
                  className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <HiOutlinePhotograph className="w-12 h-12 text-gray-600" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{collection.name}</h1>
                <div className="flex items-center gap-3 mt-2 text-sm text-gray-400">
                  <span className="badge-primary capitalize">{collection.category.replace('_', ' ')}</span>
                  <span>{collection.nftCount} NFTs</span>
                  {collection.isArchived && (
                    <span className="badge inline-flex items-center gap-1 bg-red-500/20 text-red-400">
                      <HiOutlineLockClosed className="w-3 h-3" />
                      Archived
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={() => setIsEditing(true)}
                  className="btn-secondary py-2 px-3 text-sm flex items-center gap-1">
                  <HiOutlinePencil className="w-4 h-4" /> Edit
                </button>
                <button onClick={toggleArchive}
                  className={`py-2 px-3 text-sm rounded-xl font-semibold border transition-all flex items-center gap-1 ${
                    collection.isArchived
                      ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
                      : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/20'
                  }`}>
                  <HiOutlineArchive className="w-4 h-4" />
                  {collection.isArchived ? 'Unarchive' : 'Archive'}
                </button>
              </div>
            </div>

            <p className="text-gray-400 leading-relaxed mb-4">{collection.description}</p>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <HiOutlineTag className="w-4 h-4 text-gray-500" />
              {collection.tags.map((tag) => (
                <span key={tag}
                  className="text-xs px-3 py-1 rounded-full bg-bezamint-muted/50 border border-bezamint-border text-gray-400">
                  {tag}
                </span>
              ))}
            </div>

            {/* Dates */}
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <HiOutlineClock className="w-3 h-3" />
                Created {collection.createdAt}
              </span>
              <span>Updated {collection.updatedAt}</span>
            </div>
          </div>
        </div>
      </div>

      {/* NFTs in Collection */}
      <div>
        <h2 className="section-title text-lg">NFTs in this Collection</h2>
        {collection.nfts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {collection.nfts.map((nft) => (
              <div key={nft.tokenId} className="card-interactive">
                <div className="aspect-square rounded-lg bg-bezamint-muted/50 border border-bezamint-border flex items-center justify-center mb-3">
                  <HiOutlineSparkles className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-sm font-medium text-gray-200">{nft.name}</p>
                <p className="text-xs text-gray-500">Token #{nft.tokenId}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-center py-12">
            <HiOutlineSparkles className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No NFTs in this collection yet.</p>
            <Link href="/mint" className="btn-primary text-sm inline-flex mt-4">
              Mint an NFT
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

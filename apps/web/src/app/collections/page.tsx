'use client';

import { HiOutlineCollection } from 'react-icons/hi';
import { EmptyState } from '@/components/ui';

export default function CollectionsPage() {
  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Collections</h1>
        <p className="text-gray-400 mt-2">Manage your NFT collections</p>
      </div>
      <EmptyState
        icon={HiOutlineCollection}
        title="No Collections Yet"
        description="Create your first collection to organize your NFTs. Collections help you group related digital assets together."
        actionLabel="Create Collection"
        actionHref="/mint"
      />
    </div>
  );
}

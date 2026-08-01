'use client';

import Link from 'next/link';
import { HiOutlinePhotograph, HiOutlineClock, HiOutlineLockClosed } from 'react-icons/hi';

interface CollectionCardProps {
  id: string;
  name: string;
  imageUri: string;
  category: string;
  nftCount: number;
  isArchived: boolean;
  createdAt: string;
  tags?: string[];
}

export default function CollectionCard({
  id,
  name,
  imageUri,
  category,
  nftCount,
  isArchived,
  createdAt,
  tags = [],
}: CollectionCardProps) {
  return (
    <Link
      href={`/collections/${id}`}
      className={`card block group relative overflow-hidden ${
        isArchived ? 'opacity-60' : 'card-interactive'
      }`}
    >
      {/* Image */}
      <div className="aspect-square rounded-xl bg-bezamint-muted/50 border border-bezamint-border overflow-hidden mb-4">
        {imageUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUri} alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <HiOutlinePhotograph className="w-12 h-12 text-gray-600" />
          </div>
        )}
        {isArchived && (
          <div className="absolute top-3 right-3 px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/30 text-xs text-red-400 flex items-center gap-1">
            <HiOutlineLockClosed className="w-3 h-3" />
            Archived
          </div>
        )}
      </div>

      {/* Info */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-white truncate group-hover:text-bezamint-secondary transition-colors">
            {name}
          </h3>
          <span className="badge-primary flex-shrink-0 capitalize">{category.replace('_', ' ')}</span>
        </div>

        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <span>{nftCount} {nftCount === 1 ? 'NFT' : 'NFTs'}</span>
          <span className="flex items-center gap-1">
            <HiOutlineClock className="w-3 h-3" />
            {createdAt}
          </span>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded-md bg-bezamint-muted/50 text-gray-500">
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-xs text-gray-600">+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

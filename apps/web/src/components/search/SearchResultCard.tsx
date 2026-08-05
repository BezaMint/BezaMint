'use client';

import Link from 'next/link';
import {
  HiOutlinePhotograph,
  HiOutlineCollection,
  HiOutlineUser,
  HiOutlineBadgeCheck,
} from 'react-icons/hi';

interface SearchResultProps {
  type: 'nft' | 'collection' | 'creator';
  title: string;
  subtitle: string;
  href: string;
  imageUri?: string;
  tags?: string[];
  isVerified?: boolean;
}

export default function SearchResultCard({
  type,
  title,
  subtitle,
  href,
  imageUri,
  tags = [],
  isVerified = false,
}: SearchResultProps) {
  const Icon =
    type === 'nft'
      ? HiOutlinePhotograph
      : type === 'collection'
        ? HiOutlineCollection
        : HiOutlineUser;

  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-3 rounded-xl hover:bg-bezamint-muted/30 border border-transparent hover:border-bezamint-border transition-all group"
    >
      <div className="w-12 h-12 rounded-xl bg-bezamint-muted/50 border border-bezamint-border overflow-hidden flex-shrink-0 flex items-center justify-center">
        {imageUri ? (
          <img src={imageUri} alt={title} className="w-full h-full object-cover" />
        ) : (
          <Icon className="w-5 h-5 text-gray-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider px-1.5 py-0.5 rounded text-gray-500 bg-bezamint-muted/50 font-medium">
            {type}
          </span>
          <h3 className="text-sm font-medium text-white truncate group-hover:text-bezamint-secondary transition-colors">
            {title}
          </h3>
          {isVerified && <HiOutlineBadgeCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1.5">
            {tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="text-xs px-1.5 py-0.5 rounded bg-bezamint-muted/30 text-gray-500"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <svg
        className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

'use client';

import Link from 'next/link';
import { HiOutlineBadgeCheck, HiOutlineUser } from 'react-icons/hi';
import { formatAddress } from '@/services';
import { getPlatformIcon } from '@/lib/socialPlatforms';
import type { CreatorProfile } from '@bezamint/shared';

interface CreatorCardProps extends Omit<CreatorProfile, 'createdAt' | 'updatedAt' | 'bannerUri'> {}

export default function CreatorCard({
  address,
  displayName,
  avatarUri,
  bio,
  isVerified,
  totalNftsCreated,
  totalCollections,
  socialLinks,
}: CreatorCardProps) {
  return (
    <Link href={`/creators/${address}`} className="card block card-interactive group">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-14 h-14 rounded-xl bg-bezamint-muted/50 border border-bezamint-border overflow-hidden flex-shrink-0">
          {avatarUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUri} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HiOutlineUser className="w-6 h-6 text-gray-500" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-white truncate group-hover:text-bezamint-secondary transition-colors">
              {displayName}
            </h3>
            {isVerified && (
              <HiOutlineBadgeCheck
                className="w-4 h-4 text-blue-400 flex-shrink-0"
                title="Verified"
              />
            )}
          </div>
          <p className="text-xs text-gray-500 font-mono mt-0.5">{formatAddress(address)}</p>
        </div>
      </div>
      {bio && <p className="text-sm text-gray-400 line-clamp-2 mb-4">{bio}</p>}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span>
          {totalNftsCreated} {totalNftsCreated === 1 ? 'NFT' : 'NFTs'}
        </span>
        <span>
          {totalCollections} {totalCollections === 1 ? 'Collection' : 'Collections'}
        </span>
      </div>
      {socialLinks.length > 0 && (
        <div className="flex items-center gap-2 pt-3 border-t border-bezamint-border">
          {socialLinks.slice(0, 4).map((link) => {
            const Icon = getPlatformIcon(link.platform);
            return (
              <span
                key={link.platform}
                className="p-1.5 rounded-lg bg-bezamint-muted/50 text-gray-500 hover:text-gray-300 transition-colors"
                title={link.platform}
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
            );
          })}
          {socialLinks.length > 4 && (
            <span className="text-xs text-gray-600">+{socialLinks.length - 4}</span>
          )}
        </div>
      )}
    </Link>
  );
}

'use client';

import { HiOutlineUser, HiOutlineBadgeCheck } from 'react-icons/hi';
import { HiOutlineGlobe } from 'react-icons/hi';
import { formatAddress } from '@/services';
import { getPlatformIcon } from '@/lib/socialPlatforms';
import type { CreatorProfile } from '@bezamint/shared';

interface CreatorProfileHeaderProps {
  profile: CreatorProfile;
  actions?: React.ReactNode;
}

export default function CreatorProfileHeader({ profile, actions }: CreatorProfileHeaderProps) {
  return (
    <>
      {/* Banner */}
      {profile.bannerUri && (
        <div className="h-48 lg:h-64 rounded-2xl overflow-hidden bg-bezamint-muted/50 border border-bezamint-border mb-8">
          <img src={profile.bannerUri} alt="Banner" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-start gap-6 mb-10">
        {/* Avatar */}
        <div className="w-24 h-24 rounded-2xl bg-bezamint-muted/50 border-2 border-bezamint-border overflow-hidden flex-shrink-0">
          {profile.avatarUri ? (
            <img
              src={profile.avatarUri}
              alt={profile.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HiOutlineUser className="w-10 h-10 text-gray-500" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{profile.displayName}</h1>
            {profile.isVerified && (
              <HiOutlineBadgeCheck className="w-6 h-6 text-blue-400" title="Verified Creator" />
            )}
          </div>
          <p className="text-sm text-gray-500 font-mono mb-2">{formatAddress(profile.address)}</p>
          {profile.bio && (
            <p className="text-gray-400 leading-relaxed max-w-2xl mb-4">{profile.bio}</p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm mb-4">
            <div>
              <span className="text-white font-semibold">{profile.totalNftsCreated}</span>{' '}
              <span className="text-gray-500">
                {profile.totalNftsCreated === 1 ? 'NFT' : 'NFTs'}
              </span>
            </div>
            <div>
              <span className="text-white font-semibold">{profile.totalCollections}</span>{' '}
              <span className="text-gray-500">
                {profile.totalCollections === 1 ? 'Collection' : 'Collections'}
              </span>
            </div>
          </div>

          {/* Social Links */}
          {profile.socialLinks.length > 0 && (
            <div className="flex items-center gap-2">
              {profile.socialLinks.map((link) => {
                const Icon = getPlatformIcon(link.platform);
                return (
                  <a
                    key={link.platform}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-bezamint-muted/50 border border-bezamint-border text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-all"
                    title={link.platform}
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
    </>
  );
}

'use client';

import { useParams, useRouter } from 'next/navigation';
import { HiOutlineUser, HiOutlineBadgeCheck, HiOutlineArrowLeft, HiOutlineCollection, HiOutlineSparkles } from 'react-icons/hi';
import { FaXTwitter, FaDiscord, FaGithub, FaYoutube, FaInstagram, FaTelegram } from 'react-icons/fa6';
import { HiOutlineGlobe } from 'react-icons/hi';
import { formatAddress } from '@/services';
import type { CreatorProfile } from '@bezamint/shared';

const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  twitter: FaXTwitter, discord: FaDiscord, github: FaGithub,
  youtube: FaYoutube, instagram: FaInstagram, telegram: FaTelegram,
};

const MOCK_CREATOR: CreatorProfile = {
  address: 'GABC123...',
  displayName: 'Beza Creator',
  bio: 'Digital artist exploring the intersection of generative art and blockchain technology. Creating unique NFTs on the Stellar network since 2025.',
  avatarUri: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200',
  bannerUri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200',
  socialLinks: [
    { platform: 'twitter', url: 'https://twitter.com/bezacreator' },
    { platform: 'github', url: 'https://github.com/bezacreator' },
    { platform: 'website', url: 'https://bezacreator.art' },
  ],
  createdAt: Date.now() / 1000 - 86400 * 30,
  updatedAt: Date.now() / 1000 - 86400 * 2,
  isVerified: true,
  totalNftsCreated: 42,
  totalCollections: 5,
};

export default function CreatorShowcasePage() {
  const { address } = useParams();
  const router = useRouter();
  const creator = MOCK_CREATOR;

  return (
    <div className="page-container max-w-6xl">
      <button onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors">
        <HiOutlineArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Banner */}
      {creator.bannerUri && (
        <div className="h-48 lg:h-64 rounded-2xl overflow-hidden bg-bezamint-muted/50 border border-bezamint-border mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creator.bannerUri} alt="Banner" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Creator Header */}
      <div className="flex flex-col sm:flex-row items-start gap-6 mb-10">
        <div className="w-24 h-24 rounded-2xl bg-bezamint-muted/50 border-2 border-bezamint-border overflow-hidden flex-shrink-0">
          {creator.avatarUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={creator.avatarUri} alt={creator.displayName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HiOutlineUser className="w-10 h-10 text-gray-500" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{creator.displayName}</h1>
            {creator.isVerified && (
              <HiOutlineBadgeCheck className="w-6 h-6 text-blue-400" title="Verified Creator" />
            )}
          </div>
          <p className="text-sm text-gray-500 font-mono mb-2">{formatAddress(creator.address)}</p>
          {creator.bio && (
            <p className="text-gray-400 leading-relaxed max-w-2xl mb-4">{creator.bio}</p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm mb-4">
            <div><span className="text-white font-semibold">{creator.totalNftsCreated}</span> <span className="text-gray-500">NFTs</span></div>
            <div><span className="text-white font-semibold">{creator.totalCollections}</span> <span className="text-gray-500">Collections</span></div>
          </div>

          {/* Social Links */}
          {creator.socialLinks.length > 0 && (
            <div className="flex items-center gap-2">
              {creator.socialLinks.map((link) => {
                const Icon = SOCIAL_ICONS[link.platform] || HiOutlineGlobe;
                return (
                  <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-bezamint-muted/50 border border-bezamint-border text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-all"
                    title={link.platform}>
                    <Icon className="w-4 h-4" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Creator Content */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Own NFTs */}
        <div className="card md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineSparkles className="w-5 h-5 text-bezamint-secondary" />
            <h2 className="text-lg font-semibold text-white">Created NFTs</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-lg bg-bezamint-muted/30 border border-bezamint-border flex items-center justify-center">
                <HiOutlineSparkles className="w-6 h-6 text-gray-600" />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">{creator.totalNftsCreated} NFTs total</p>
        </div>

        {/* Collections */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineCollection className="w-5 h-5 text-bezamint-secondary" />
            <h2 className="text-lg font-semibold text-white">Collections</h2>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-bezamint-muted/30 border border-bezamint-border">
                <div className="w-10 h-10 rounded-lg bg-bezamint-muted/50 flex items-center justify-center">
                  <HiOutlineCollection className="w-5 h-5 text-gray-500" />
                </div>
                <div><p className="text-sm text-gray-200">Collection #{i + 1}</p><p className="text-xs text-gray-500">8 NFTs</p></div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">{creator.totalCollections} collections total</p>
        </div>
      </div>
    </div>
  );
}

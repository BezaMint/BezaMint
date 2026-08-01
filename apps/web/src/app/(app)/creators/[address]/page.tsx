'use client';

import { useParams, useRouter } from 'next/navigation';
import { HiOutlineArrowLeft, HiOutlineCollection, HiOutlineSparkles } from 'react-icons/hi';
import { CreatorProfileHeader } from '@/components/profile';
import type { CreatorProfile } from '@bezamint/shared';

const MOCK_CREATOR: CreatorProfile = {
  address: 'GABC1234567890123456789012345678901234567',
  displayName: 'Beza Creator',
  bio: 'Digital artist exploring the intersection of generative art and blockchain technology.',
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
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 mb-6 transition-colors"
      >
        <HiOutlineArrowLeft className="w-4 h-4" />
        Back
      </button>

      <CreatorProfileHeader profile={creator} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineSparkles className="w-5 h-5 text-bezamint-secondary" />
            <h2 className="text-lg font-semibold text-white">Created NFTs</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-bezamint-muted/30 border border-bezamint-border flex items-center justify-center"
              >
                <HiOutlineSparkles className="w-6 h-6 text-gray-600" />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">{creator.totalNftsCreated} NFTs total</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineCollection className="w-5 h-5 text-bezamint-secondary" />
            <h2 className="text-lg font-semibold text-white">Collections</h2>
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-2 rounded-lg bg-bezamint-muted/30 border border-bezamint-border"
              >
                <div className="w-10 h-10 rounded-lg bg-bezamint-muted/50 flex items-center justify-center">
                  <HiOutlineCollection className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="text-sm text-gray-200">Collection #{i + 1}</p>
                  <p className="text-xs text-gray-500">8 NFTs</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4">{creator.totalCollections} collections total</p>
        </div>
      </div>
    </div>
  );
}

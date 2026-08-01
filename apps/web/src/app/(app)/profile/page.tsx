'use client';

import { useState } from 'react';
import { HiOutlineUser } from 'react-icons/hi';
import { CreatorProfileForm, CreatorProfileHeader } from '@/components/profile';
import { useWallet } from '@/context';
import { useToast } from '@/context';
import type { CreatorFormState, CreatorProfile } from '@bezamint/shared';

const MOCK_PROFILE: CreatorProfile = {
  address: '',
  displayName: 'Beza Creator',
  bio: 'Digital artist and NFT creator on the Stellar network.',
  avatarUri: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200',
  bannerUri: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200',
  socialLinks: [
    { platform: 'twitter', url: 'https://twitter.com/bezacreator' },
    { platform: 'github', url: 'https://github.com/bezacreator' },
  ],
  createdAt: Date.now() / 1000 - 86400 * 7,
  updatedAt: Date.now() / 1000,
  isVerified: false,
  totalNftsCreated: 15,
  totalCollections: 3,
};

export default function ProfilePage() {
  const { isConnected, address, connect } = useWallet();
  const { showSuccess } = useToast();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayProfile = profile || (isConnected ? { ...MOCK_PROFILE, address: address! } : null);

  const handleSave = async (data: CreatorFormState) => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));

    setProfile((prev) => ({
      address: address!,
      ...data,
      isVerified: prev?.isVerified ?? false,
      createdAt: prev?.createdAt ?? Date.now() / 1000,
      updatedAt: Date.now() / 1000,
      totalNftsCreated: prev?.totalNftsCreated ?? 0,
      totalCollections: prev?.totalCollections ?? 0,
    }));

    setIsSubmitting(false);
    setIsEditing(false);
    showSuccess(displayProfile ? 'Profile updated!' : 'Profile created!');
  };

  if (!isConnected) {
    return (
      <div className="page-container max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">Creator Profile</h1>
          <p className="text-gray-400 mt-2">Connect your wallet to create your creator profile</p>
        </div>
        <div className="card text-center py-12 max-w-lg mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bezamint-muted/50 border border-bezamint-border mb-4">
            <HiOutlineUser className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">Connect Your Wallet</h3>
          <p className="text-sm text-gray-500 mb-6">
            Connect Freighter to set up your creator profile and showcase your work.
          </p>
          <button onClick={connect} className="btn-primary text-sm">Connect Wallet</button>
        </div>
      </div>
    );
  }

  if (isEditing || !displayProfile) {
    return (
      <div className="page-container max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            {displayProfile ? 'Edit Profile' : 'Create Profile'}
          </h1>
          <p className="text-gray-400 mt-2">
            {displayProfile
              ? 'Update your creator profile'
              : 'Set up your creator identity on Stellar'}
          </p>
        </div>
        <div className="card max-w-lg mx-auto">
          <CreatorProfileForm
            key={String(isEditing)}
            onSubmit={handleSave}
            onCancel={() => (displayProfile ? setIsEditing(false) : connect())}
            initialData={
              displayProfile
                ? {
                    displayName: displayProfile.displayName,
                    bio: displayProfile.bio,
                    avatarUri: displayProfile.avatarUri,
                    bannerUri: displayProfile.bannerUri || '',
                    socialLinks: displayProfile.socialLinks,
                  }
                : undefined
            }
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-6xl">
      <CreatorProfileHeader
        profile={displayProfile!}
        actions={
          <button onClick={() => setIsEditing(true)} className="btn-secondary py-2 px-4 text-sm">
            Edit Profile
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Collections</h2>
          <p className="text-sm text-gray-400">
            {displayProfile!.totalCollections > 0
              ? `${displayProfile!.totalCollections} ${displayProfile!.totalCollections === 1 ? 'collection' : 'collections'} created`
              : 'No collections yet.'}
          </p>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">NFTs</h2>
          <p className="text-sm text-gray-400">
            {displayProfile!.totalNftsCreated > 0
              ? `${displayProfile!.totalNftsCreated} ${displayProfile!.totalNftsCreated === 1 ? 'NFT' : 'NFTs'} minted`
              : 'No NFTs yet.'}
          </p>
        </div>
      </div>
    </div>
  );
}

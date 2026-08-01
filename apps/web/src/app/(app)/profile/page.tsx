'use client';

import { useState, useCallback } from 'react';
import { HiOutlineUser, HiOutlineBadgeCheck } from 'react-icons/hi';
import { FaXTwitter, FaDiscord, FaGithub, FaYoutube, FaInstagram, FaTelegram } from 'react-icons/fa6';
import { HiOutlineGlobe } from 'react-icons/hi';
import { CreatorProfileForm, CreatorCard } from '@/components/profile';
import { useWallet } from '@/context';
import { useToast } from '@/context';
import { formatAddress } from '@/services';
import type { CreatorFormState, SocialLink, CreatorProfile as CreatorProfileType } from '@bezamint/shared';

const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  twitter: FaXTwitter, discord: FaDiscord, github: FaGithub,
  youtube: FaYoutube, instagram: FaInstagram, telegram: FaTelegram,
};

// Mock profile data
const MOCK_PROFILE: CreatorProfileType = {
  address: '',
  displayName: 'Beza Creator',
  bio: 'Digital artist and NFT creator on the Stellar network. Building the future of digital ownership.',
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
  const [profile, setProfile] = useState<CreatorProfileType | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use mock data once connected
  const displayProfile = profile || (isConnected ? { ...MOCK_PROFILE, address: address! } : null);

  const handleCreate = async (data: CreatorFormState) => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setProfile({
      address: address!,
      ...data,
      isVerified: false,
      createdAt: Date.now() / 1000,
      updatedAt: Date.now() / 1000,
      totalNftsCreated: 0,
      totalCollections: 0,
    });
    setIsSubmitting(false);
    setIsEditing(false);
    showSuccess('Profile created!');
  };

  const handleUpdate = async (data: CreatorFormState) => {
    setIsSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setProfile((prev) =>
      prev ? { ...prev, ...data, updatedAt: Date.now() / 1000 } : null,
    );
    setIsSubmitting(false);
    setIsEditing(false);
    showSuccess('Profile updated!');
  };

  // Not connected
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
          <p className="text-sm text-gray-500 mb-6">Connect Freighter to set up your creator profile and showcase your work.</p>
          <button onClick={connect} className="btn-primary text-sm">Connect Wallet</button>
        </div>
      </div>
    );
  }

  // Edit mode
  if (isEditing || !displayProfile) {
    return (
      <div className="page-container max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">
            {displayProfile ? 'Edit Profile' : 'Create Profile'}
          </h1>
          <p className="text-gray-400 mt-2">
            {displayProfile ? 'Update your creator profile' : 'Set up your creator identity on Stellar'}
          </p>
        </div>
        <div className="card max-w-lg mx-auto">
          <CreatorProfileForm
            key={String(isEditing)}
            onSubmit={displayProfile ? handleUpdate : handleCreate}
            onCancel={displayProfile ? () => setIsEditing(false) : connect}
            initialData={displayProfile ? {
              displayName: displayProfile.displayName,
              bio: displayProfile.bio,
              avatarUri: displayProfile.avatarUri,
              bannerUri: displayProfile.bannerUri || '',
              socialLinks: displayProfile.socialLinks,
            } : undefined}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    );
  }

  // Showcase
  const profileData = displayProfile;
  return (
    <div className="page-container max-w-6xl">
      {/* Banner */}
      {profileData.bannerUri && (
        <div className="h-48 lg:h-64 rounded-2xl overflow-hidden bg-bezamint-muted/50 border border-bezamint-border mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={profileData.bannerUri} alt="Banner"
            className="w-full h-full object-cover" />
        </div>
      )}

      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row items-start gap-6 mb-10">
        <div className="w-24 h-24 rounded-2xl bg-bezamint-muted/50 border-2 border-bezamint-border overflow-hidden flex-shrink-0">
          {profileData.avatarUri ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileData.avatarUri} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <HiOutlineUser className="w-10 h-10 text-gray-500" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{profileData.displayName}</h1>
            {profileData.isVerified && (
              <HiOutlineBadgeCheck className="w-6 h-6 text-blue-400" title="Verified" />
            )}
          </div>
          <p className="text-sm text-gray-500 font-mono mb-2">{formatAddress(profileData.address)}</p>
          {profileData.bio && (
            <p className="text-gray-400 leading-relaxed max-w-2xl mb-4">{profileData.bio}</p>
          )}

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm mb-4">
            <div><span className="text-white font-semibold">{profileData.totalNftsCreated}</span> <span className="text-gray-500">NFTs Created</span></div>
            <div><span className="text-white font-semibold">{profileData.totalCollections}</span> <span className="text-gray-500">Collections</span></div>
          </div>

          {/* Social Links */}
          {profileData.socialLinks.length > 0 && (
            <div className="flex items-center gap-2">
              {profileData.socialLinks.map((link) => {
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

        {/* Edit Button */}
        <button onClick={() => setIsEditing(true)}
          className="btn-secondary py-2 px-4 text-sm flex-shrink-0">
          Edit Profile
        </button>
      </div>

      {/* Collections & NFTs Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">Collections</h2>
          <p className="text-sm text-gray-400">
            {profileData.totalCollections > 0
              ? `${profileData.totalCollections} collections created`
              : 'No collections yet. Create one to get started!'}
          </p>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-4">NFTs</h2>
          <p className="text-sm text-gray-400">
            {profileData.totalNftsCreated > 0
              ? `${profileData.totalNftsCreated} NFTs minted`
              : 'No NFTs yet. Mint your first one!'}
          </p>
        </div>
      </div>
    </div>
  );
}

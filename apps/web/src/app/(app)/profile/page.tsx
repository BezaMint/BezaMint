'use client';

import { useState, useEffect } from 'react';
import { HiOutlineUser } from 'react-icons/hi';
import { CreatorProfileForm, CreatorProfileHeader } from '@/components/profile';
import { useWallet } from '@/context';
import { useToast } from '@/context';
import type { CreatorFormState, CreatorProfile } from '@bezamint/shared';
import {
  getCreatorProfile,
  registerCreator,
  updateCreatorProfile,
  setCreatorSocialLinks,
  signAndSubmit,
} from '@/services/contracts';

export default function ProfilePage() {
  const { isConnected, address, connect } = useWallet();
  const { showSuccess, showError } = useToast();
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load the real on-chain profile for the connected wallet.
  useEffect(() => {
    if (!isConnected || !address) return;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const onChain = await getCreatorProfile(address, address);
        if (!cancelled && onChain) {
          setProfile({
            address: onChain.address,
            displayName: onChain.displayName || 'Unnamed Creator',
            bio: onChain.bio,
            avatarUri: onChain.avatarUri,
            bannerUri: onChain.bannerUri,
            socialLinks: onChain.socialLinks,
            createdAt: Date.now() / 1000,
            updatedAt: Date.now() / 1000,
            isVerified: onChain.isVerified,
            totalNftsCreated: 0,
            totalCollections: 0,
          });
        }
      } catch {
        // Unreachable chain — treat as unregistered (create form shows).
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const displayProfile = profile;
  const showCreateForm = isConnected && !profile && !isEditing;

  const handleSave = async (data: CreatorFormState) => {
    if (!isConnected || !address) return;
    setIsSubmitting(true);

    try {
      const input = {
        displayName: data.displayName,
        bio: data.bio,
        avatarUri: data.avatarUri,
        bannerUri: data.bannerUri,
      };

      // Register or update the on-chain profile.
      //
      // The on-chain read above is the primary source of truth, but it can fail
      // transiently and the catch treats that as "no profile". A creator who
      // created a collection first was auto-registered by the Factory with a
      // placeholder name, and `register` refuses an existing profile with
      // `AlreadyRegistered`, so a lookup failure would turn a profile save into
      // a revert for exactly the users who did the most. Fall back to
      // `update_profile`, and keep the original error if that fails too.
      const isNew = !profile;
      let txXdr: string;
      try {
        txXdr = isNew
          ? await registerCreator(address, input)
          : await updateCreatorProfile(address, input);
      } catch (error) {
        if (!isNew) throw error;
        try {
          txXdr = await updateCreatorProfile(address, input);
        } catch {
          throw error;
        }
      }
      const result = await signAndSubmit(txXdr);
      if (!result.txHash) throw new Error('Profile submission failed');

      // Submit social links (best-effort; not fatal if it fails).
      if (data.socialLinks.length > 0) {
        try {
          const linksTx = await setCreatorSocialLinks(address, data.socialLinks);
          await signAndSubmit(linksTx);
        } catch {
          // Social links failed but the profile itself is saved.
        }
      }

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
      showSuccess(isNew ? 'Profile created!' : 'Profile updated!');
    } catch (err: unknown) {
      setIsSubmitting(false);
      showError((err as Error)?.message || 'Failed to save profile');
    }
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
          <button onClick={connect} className="btn-primary text-sm">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="page-container max-w-6xl">
        <div className="h-48 lg:h-64 rounded-2xl bg-bezamint-muted/40 animate-pulse mb-8" />
        <div className="flex gap-6 mb-10">
          <div className="w-24 h-24 rounded-2xl bg-bezamint-muted/40 animate-pulse" />
          <div className="flex-1 space-y-3">
            <div className="h-7 w-64 bg-bezamint-muted/40 rounded animate-pulse" />
            <div className="h-4 w-40 bg-bezamint-muted/30 rounded animate-pulse" />
            <div className="h-4 w-72 bg-bezamint-muted/30 rounded animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (isEditing || showCreateForm) {
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

  if (!displayProfile) {
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
          <button onClick={connect} className="btn-primary text-sm">
            Connect Wallet
          </button>
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

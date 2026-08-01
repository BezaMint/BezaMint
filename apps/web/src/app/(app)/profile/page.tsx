'use client';

import { HiOutlineUser } from 'react-icons/hi';
import { EmptyState } from '@/components/ui';
import { useWallet } from '@/context';
import { formatAddress } from '@/services';

export default function ProfilePage() {
  const { isConnected, address } = useWallet();

  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Creator Profile</h1>
        <p className="text-gray-400 mt-2">
          {isConnected ? `Managing profile for ${formatAddress(address!)}` : 'Connect your wallet to view your profile'}
        </p>
      </div>
      <EmptyState
        icon={HiOutlineUser}
        title="Profile Setup Coming Soon"
        description="Create your creator profile to showcase your collections, NFTs, and connect with the Stellar creator community."
        actionLabel="Connect Wallet"
        actionHref="/"
      />
    </div>
  );
}

'use client';

import { HiOutlineSparkles } from 'react-icons/hi';

export default function MintPage() {
  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Mint NFT</h1>
        <p className="text-gray-400 mt-2">Create a new NFT on the Stellar network</p>
      </div>

      <div className="card max-w-2xl mx-auto text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-bezamint-primary/10 border border-bezamint-primary/20 mb-4">
          <HiOutlineSparkles className="w-8 h-8 text-bezamint-secondary" />
        </div>
        <h3 className="text-lg font-semibold text-gray-300 mb-2">Minting Coming Soon</h3>
        <p className="text-sm text-gray-500 max-w-sm mx-auto">
          The NFT minting engine is being built. Connect your Freighter wallet and prepare your
          digital assets — full minting capabilities are coming in the next phase.
        </p>
      </div>
    </div>
  );
}

'use client';

import { HiOutlineSparkles } from 'react-icons/hi';
import MintForm from '@/components/mint/MintForm';

export default function MintPage() {
  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Mint NFT</h1>
        <p className="text-gray-400 mt-2">Create a new NFT on the Stellar network</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form */}
        <div className="lg:col-span-2">
          <MintForm />
        </div>

        {/* Sidebar Info */}
        <aside className="space-y-4">
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <HiOutlineSparkles className="w-5 h-5 text-bezamint-secondary" />
              <h3 className="text-sm font-semibold text-gray-200">How Minting Works</h3>
            </div>
            <ol className="space-y-2 text-sm text-gray-400">
              <li className="flex gap-2">
                <span className="text-bezamint-secondary font-mono">1.</span>
                Fill in your NFT details and metadata
              </li>
              <li className="flex gap-2">
                <span className="text-bezamint-secondary font-mono">2.</span>
                Configure attributes and royalties
              </li>
              <li className="flex gap-2">
                <span className="text-bezamint-secondary font-mono">3.</span>
                Click &quot;Mint NFT&quot; to build the transaction
              </li>
              <li className="flex gap-2">
                <span className="text-bezamint-secondary font-mono">4.</span>
                Sign the transaction with Freighter wallet
              </li>
              <li className="flex gap-2">
                <span className="text-bezamint-secondary font-mono">5.</span>
                Wait for confirmation on Stellar testnet
              </li>
            </ol>
          </div>

          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <h3 className="text-sm font-semibold text-gray-200">Testnet Only</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              All NFTs are minted on the Stellar testnet. No real assets are involved. Make sure you
              have testnet XLM in your Freighter wallet to cover transaction fees.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { HiOutlineSearch, HiOutlineBadgeCheck, HiOutlineShieldCheck } from 'react-icons/hi';
import { useWallet } from '@/context';

const MOCK_OWNERS = {
  '1': {
    owner: 'GABC1234567890123456789012345678901234567',
    tokenId: 1,
    name: 'Abstract #001',
    confirmed: true,
  },
  '2': {
    owner: 'GXYZ9876543210987654321098765432109876543',
    tokenId: 2,
    name: 'Gaming Sword',
    confirmed: true,
  },
};

export default function VerifyPage() {
  const { address, isConnected } = useWallet();
  const [tokenId, setTokenId] = useState('');
  const [result, setResult] = useState<{
    owner: string;
    tokenId: number;
    name: string;
    confirmed: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!tokenId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    await new Promise((r) => setTimeout(r, 800));

    try {
      const found = (
        MOCK_OWNERS as Record<
          string,
          { owner: string; tokenId: number; name: string; confirmed: boolean }
        >
      )[tokenId.trim()];
      if (found) {
        setResult(found);
      } else {
        setError(`No NFT found with token ID "${tokenId}"`);
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Ownership Verification</h1>
        <p className="text-gray-400 mt-2">
          Verify NFT ownership directly from the Stellar blockchain
        </p>
      </div>

      <div className="max-w-xl mx-auto space-y-6">
        {/* Search */}
        <div className="card">
          <label className="input-label">Token ID</label>
          <div className="flex gap-3">
            <input
              type="number"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              placeholder="Enter NFT token ID..."
              min="1"
              className="input-field flex-1"
            />
            <button
              onClick={handleVerify}
              disabled={loading || !tokenId.trim()}
              className="btn-primary py-3 px-6 flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                <HiOutlineSearch className="w-4 h-4" />
              )}
              Verify
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="card border-bezamint-primary/30">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-xl bg-bezamint-primary/10 border border-bezamint-primary/20">
                <HiOutlineBadgeCheck className="w-6 h-6 text-bezamint-secondary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{result.name}</h3>
                <p className="text-sm text-gray-400">Token #{result.tokenId}</p>
              </div>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-bezamint-muted/30 border border-bezamint-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Owner</span>
                <span className="text-sm font-mono text-white">
                  {result.owner.slice(0, 8)}...{result.owner.slice(-6)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Status</span>
                <span className="flex items-center gap-1 text-sm text-bezamint-secondary">
                  <HiOutlineShieldCheck className="w-4 h-4" />
                  Verified on-chain
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Network</span>
                <span className="text-sm text-gray-300">Stellar Testnet</span>
              </div>
              {address && result.owner === address && (
                <div className="text-sm text-bezamint-secondary bg-bezamint-primary/5 rounded-lg p-3">
                  You own this NFT
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="card border-red-500/30 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

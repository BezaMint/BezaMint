'use client';

import {
  HiOutlineCog,
  HiOutlineShieldCheck,
  HiOutlineServer,
  HiOutlineGlobe,
  HiOutlineKey,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import { useWallet } from '@/context';
import { formatAddress, getExplorerAccountUrl, CONTRACT_IDS } from '@/services';
import { EXPLORER_URL } from '@/lib/constants';
import { buildExplorerUrl } from '@/lib/explorer-url';

export default function SettingsPage() {
  const { address, isConnected, network } = useWallet();

  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-2">Manage your account and network preferences</p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Account */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <HiOutlineKey className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Account</h2>
          </div>
          {isConnected && address ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
                <span className="text-sm text-gray-400">Wallet Address</span>
                <span className="text-sm font-mono text-white">{formatAddress(address)}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
                <span className="text-sm text-gray-400">Network</span>
                <span className="text-sm text-gray-200 capitalize">{network}</span>
              </div>
              <a
                href={getExplorerAccountUrl(address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-bezamint-secondary hover:text-bezamint-primary transition-colors"
              >
                <HiOutlineGlobe className="w-4 h-4" />
                View on Stellar Explorer
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Connect your Freighter wallet to view account details.
            </p>
          )}
        </div>

        {/* Network */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <HiOutlineServer className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Network</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
              <div>
                <span className="text-sm font-medium text-gray-200">Stellar Testnet</span>
                <p className="text-xs text-gray-500">Soroban RPC</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-bezamint-secondary animate-pulse" />
                <span className="text-xs text-bezamint-secondary">Connected</span>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
              <span className="text-sm text-gray-400">RPC URL</span>
              <span className="text-xs font-mono text-gray-500">soroban-testnet.stellar.org</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
              <span className="text-sm text-gray-400">Passphrase</span>
              <span className="text-xs font-mono text-gray-500 truncate max-w-[200px]">
                Test SDF Network ; September 2015
              </span>
            </div>
          </div>
        </div>

        {/* Contracts */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <HiOutlineShieldCheck className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Smart Contracts</h2>
          </div>
          <div className="space-y-2">
            {[
              { label: 'NFT Contract', id: CONTRACT_IDS.nft },
              { label: 'Collection Contract', id: CONTRACT_IDS.collection },
              { label: 'Royalty Contract', id: CONTRACT_IDS.royalty },
              { label: 'Creator Contract', id: CONTRACT_IDS.creator },
              { label: 'Factory Contract', id: CONTRACT_IDS.factory },
            ].map(({ label, id }) => (
              <div
                key={label}
                className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border"
              >
                <span className="text-sm text-gray-400">{label}</span>
                {id ? (
                  <a
                    href={buildExplorerUrl('testnet', 'contract', id, EXPLORER_URL)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-mono text-bezamint-secondary hover:text-bezamint-primary transition-colors"
                  >
                    {id.slice(0, 8)}...{id.slice(-6)}
                    <HiOutlineExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs font-mono text-gray-600">Not deployed</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Platform Info */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <HiOutlineCog className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Platform</h2>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
              <span className="text-sm text-gray-400">Version</span>
              <span className="text-sm text-gray-200">0.1.0</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
              <span className="text-sm text-gray-400">Environment</span>
              <span className="text-sm text-gray-200">Development</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

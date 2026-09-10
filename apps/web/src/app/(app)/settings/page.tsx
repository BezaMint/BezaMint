'use client';

import {
  HiOutlineCog,
  HiOutlineShieldCheck,
  HiOutlineServer,
  HiOutlineGlobe,
  HiOutlineKey,
  HiOutlineExternalLink,
  HiOutlineRefresh,
  HiOutlineExclamation,
  HiOutlineCheckCircle,
  HiOutlineClock,
} from 'react-icons/hi';
import { useWallet } from '@/context';
import { formatAddress, getExplorerAccountUrl } from '@/services';
import { useNetworkHealth } from '@/hooks/useNetworkHealth';
import { STELLAR_NETWORK_PASSPHRASE, STELLAR_RPC_URL } from '@/lib/constants';

export default function SettingsPage() {
  const { address, isConnected, network } = useWallet();
  const { network: health, contracts, recheck } = useNetworkHealth();

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
              {health.checking ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-bezamint-secondary animate-pulse" />
                  <span className="text-xs text-bezamint-secondary">Checking…</span>
                </div>
              ) : health.result?.ok ? (
                <div className="flex items-center gap-2">
                  <HiOutlineCheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-400">
                    Connected · ledger {health.result.latestLedger} · {health.result.latencyMs}ms
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <HiOutlineExclamation className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-red-400">Unreachable</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
              <span className="text-sm text-gray-400">RPC URL</span>
              <span className="text-xs font-mono text-gray-500">{STELLAR_RPC_URL}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
              <span className="text-sm text-gray-400">Passphrase</span>
              <span className="text-xs font-mono text-gray-500 truncate max-w-[240px]">
                {STELLAR_NETWORK_PASSPHRASE}
              </span>
            </div>
            {!health.checking && !health.result?.ok && (
              <p className="text-xs text-red-400/80">{health.result?.error}</p>
            )}
          </div>
        </div>

        {/* Contracts */}
        <div className="card">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <HiOutlineShieldCheck className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-white">Smart Contracts</h2>
            </div>
            <button
              type="button"
              onClick={() => void recheck()}
              className="inline-flex items-center gap-1.5 text-xs text-bezamint-secondary hover:text-bezamint-primary transition-colors"
            >
              <HiOutlineRefresh className="w-3.5 h-3.5" />
              Re-check
            </button>
          </div>
          <div className="space-y-2">
            {contracts.map(({ label, contractId, result }) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border"
              >
                <span className="text-sm text-gray-400">{label}</span>
                <div className="flex items-center gap-2 min-w-0">
                  {contractId ? (
                    result ? (
                      result.status === 'ok' ? (
                        <span className="flex items-center gap-1.5 text-xs text-green-400 whitespace-nowrap">
                          <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                          Responding · {result.latencyMs}ms
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-1.5 text-xs text-red-400 whitespace-nowrap"
                          title={result.error}
                        >
                          <HiOutlineExclamation className="w-3.5 h-3.5" />
                          Error
                        </span>
                      )
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                        <HiOutlineClock className="w-3.5 h-3.5 animate-pulse" />
                        Probing…
                      </span>
                    )
                  ) : (
                    <span className="text-xs font-mono text-gray-600 whitespace-nowrap">
                      Not deployed
                    </span>
                  )}
                  {contractId && (
                    <a
                      href={`${process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://stellar.expert/explorer/testnet'}/contract/${contractId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-mono text-bezamint-secondary hover:text-bezamint-primary transition-colors shrink-0"
                    >
                      {contractId.slice(0, 8)}...{contractId.slice(-6)}
                      <HiOutlineExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
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
              <span className="text-sm text-gray-200 capitalize">
                {process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

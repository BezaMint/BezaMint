'use client';

import React from 'react';
import { HiOutlineLogout, HiOutlineSwitchHorizontal, HiOutlineExternalLink } from 'react-icons/hi';
import { useWallet } from '@/context';
import { formatAddress, getExplorerAccountUrl } from '@/services';

export default function Header() {
  const { address, isConnected, isConnecting, connect, disconnect, connectionState } = useWallet();

  return (
    <header className="sticky top-0 z-30 h-16 bg-bezamint-surface/80 backdrop-blur-lg border-b border-bezamint-border flex items-center justify-between px-6">
      {/* Left spacer (sidebar offset) */}
      <div className="w-64" />

      {/* Center — page title area */}
      <div className="flex-1 flex items-center justify-between max-w-6xl">
        <div className="text-sm text-gray-400">
          {isConnected ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-bezamint-secondary animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gray-500" />
              Not Connected
            </span>
          )}
        </div>

        {/* Wallet button */}
        {isConnected && address ? (
          <div className="flex items-center gap-2">
            {/* Address badge */}
            <a
              href={getExplorerAccountUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bezamint-muted/50 border border-bezamint-border text-sm text-gray-300 hover:bg-bezamint-muted transition-all group"
            >
              <span className="font-mono text-xs">{formatAddress(address)}</span>
              <HiOutlineExternalLink className="w-3 h-3 text-gray-500 group-hover:text-gray-300" />
            </a>

            {/* Disconnect */}
            <button
              onClick={disconnect}
              className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
              title="Disconnect"
            >
              <HiOutlineLogout className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            disabled={isConnecting}
            className="btn-primary text-sm py-2 px-5 flex items-center gap-2"
          >
            {isConnecting ? (
              <>
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
                Connecting...
              </>
            ) : (
              <>Connect Wallet</>
            )}
          </button>
        )}
      </div>
    </header>
  );
}

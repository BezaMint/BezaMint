'use client';

import { HiOutlineCog } from 'react-icons/hi';

export default function SettingsPage() {
  return (
    <div className="page-container max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-2">Manage your account and preferences</p>
      </div>
      <div className="card max-w-xl">
        <div className="flex items-center gap-3 mb-4">
          <HiOutlineCog className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-white">Network</h2>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-bezamint-muted/50 border border-bezamint-border">
          <div>
            <span className="text-sm font-medium text-gray-200">Stellar Testnet</span>
            <p className="text-xs text-gray-500">Connected to Soroban testnet RPC</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-bezamint-secondary" />
        </div>
      </div>
    </div>
  );
}

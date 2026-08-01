'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HiOutlineRefresh } from 'react-icons/hi';
import { BezaMintLogo } from '@/components/ui/Logo';
import { NAV_ITEMS } from '@/lib/navigation';
import { useWallet } from '@/context';
import { formatAddress } from '@/services';

export default function Sidebar() {
  const pathname = usePathname();
  const { address, isConnected, balance, refreshBalance } = useWallet();

  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-bezamint-border bg-bezamint-surface/95 backdrop-blur-sm flex flex-col"
      role="complementary"
      aria-label="Sidebar navigation"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-bezamint-border">
        <BezaMintLogo size={32} />
        <span className="text-xl font-bold text-gradient">BezaMint</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1" aria-label="Main navigation">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-bezamint-primary/10 text-bezamint-secondary'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-bezamint-muted/50'
              }`}
            >
              <Icon
                className={`w-5 h-5 flex-shrink-0 transition-colors ${
                  isActive ? 'text-bezamint-secondary' : 'text-gray-500 group-hover:text-gray-300'
                }`}
              />
              <span>{label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-bezamint-secondary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer — wallet info */}
      <div className="px-5 py-4 border-t border-bezamint-border space-y-3">
        {/* Balance */}
        {isConnected && address && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Balance</span>
              <button
                onClick={refreshBalance}
                className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
                title="Refresh balance"
                aria-label="Refresh balance"
              >
                <HiOutlineRefresh className="w-3 h-3" />
              </button>
            </div>
            <div className="text-sm font-mono text-bezamint-secondary">
              {balance.isLoading ? (
                <span className="text-gray-500">Loading...</span>
              ) : balance.error ? (
                <span className="text-red-400 text-xs">Error</span>
              ) : (
                <>{balance.balance ? parseFloat(balance.balance).toFixed(4) : '0.0000'} XLM</>
              )}
            </div>
            <div className="text-xs text-gray-600 font-mono truncate">{formatAddress(address)}</div>
          </div>
        )}

        {/* Network indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-1.5 h-1.5 rounded-full bg-bezamint-primary animate-pulse" />
          Stellar Testnet
        </div>
      </div>
    </aside>
  );
}

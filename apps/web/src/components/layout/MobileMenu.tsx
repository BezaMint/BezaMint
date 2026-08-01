'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HiOutlineMenu, HiOutlineX, HiOutlineRefresh } from 'react-icons/hi';
import { BezaMintLogo } from '@/components/ui/Logo';
import { NAV_ITEMS } from '@/lib/navigation';
import { useWallet } from '@/context';
import { formatAddress } from '@/services';

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { address, isConnected, balance, refreshBalance } = useWallet();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    // Focus the close button when menu opens
    setTimeout(() => closeButtonRef.current?.focus(), 100);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 p-2 rounded-xl bg-bezamint-card border border-bezamint-border text-gray-300 hover:text-white focus:ring-2 focus:ring-bezamint-primary focus:outline-none"
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
      >
        <HiOutlineMenu className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          id="mobile-menu"
          className="lg:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            role="presentation"
          />
          <div className="absolute left-0 top-0 h-full w-64 bg-bezamint-surface border-r border-bezamint-border animate-fade-in">
            <div className="flex items-center justify-between px-6 h-16 border-b border-bezamint-border">
              <div className="flex items-center gap-3">
                <BezaMintLogo size={28} />
                <span className="text-lg font-bold text-gradient">BezaMint</span>
              </div>
              <button
                ref={closeButtonRef}
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:text-white focus:ring-2 focus:ring-bezamint-primary focus:outline-none"
                aria-label="Close navigation menu"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* Balance in mobile menu */}
            {isConnected && address && (
              <div className="px-5 py-3 border-b border-bezamint-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Balance</span>
                  <button
                    onClick={refreshBalance}
                    className="p-0.5 text-gray-500 hover:text-gray-300"
                    aria-label="Refresh balance"
                  >
                    <HiOutlineRefresh className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-sm font-mono text-bezamint-secondary mt-0.5">
                  {balance.isLoading
                    ? 'Loading...'
                    : `${balance.balance ? parseFloat(balance.balance).toFixed(4) : '0.0000'} XLM`}
                </div>
                <div className="text-xs text-gray-600 truncate mt-0.5">
                  {formatAddress(address)}
                </div>
              </div>
            )}

            <nav className="py-4 px-3 space-y-1" aria-label="Mobile navigation links">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                      ${isActive ? 'bg-bezamint-primary/10 text-bezamint-secondary' : 'text-gray-400 hover:text-gray-200 hover:bg-bezamint-muted/50'}`}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    <Icon
                      className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-bezamint-secondary' : 'text-gray-500'}`}
                    />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 px-6 py-4 border-t border-bezamint-border">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-1.5 h-1.5 rounded-full bg-bezamint-primary animate-pulse" />
                Stellar Testnet
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

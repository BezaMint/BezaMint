'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HiOutlineMenu, HiOutlineX } from 'react-icons/hi';
import { BezaMintLogo } from '@/components/ui/Logo';
import { NAV_ITEMS } from '@/lib/navigation';

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-xl bg-bezamint-card border border-bezamint-border text-gray-300 hover:text-white"
        aria-label="Open menu"
      >
        <HiOutlineMenu className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-bezamint-surface border-r border-bezamint-border animate-fade-in">
            <div className="flex items-center justify-between px-6 h-16 border-b border-bezamint-border">
              <div className="flex items-center gap-3">
                <BezaMintLogo size={28} />
                <span className="text-lg font-bold text-gradient">BezaMint</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 rounded-lg text-gray-400 hover:text-white">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <nav className="py-4 px-3 space-y-1">
              {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href || pathname.startsWith(href + '/');
                return (
                  <Link key={href} href={href} onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive ? 'bg-bezamint-primary/10 text-bezamint-secondary' : 'text-gray-400 hover:text-gray-200 hover:bg-bezamint-muted/50'
                    }`}>
                    <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-bezamint-secondary' : 'text-gray-500'}`} />
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

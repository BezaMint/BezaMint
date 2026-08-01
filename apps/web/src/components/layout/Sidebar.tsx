'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HiOutlineHome,
  HiOutlineCollection,
  HiOutlinePlusCircle,
  HiOutlineUser,
  HiOutlineSearch,
  HiOutlineCog,
} from 'react-icons/hi';
import { BezaMintLogo } from '@/components/ui/Logo';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: HiOutlineHome },
  { href: '/collections', label: 'Collections', icon: HiOutlineCollection },
  { href: '/mint', label: 'Mint NFT', icon: HiOutlinePlusCircle },
  { href: '/explore', label: 'Explore', icon: HiOutlineSearch },
  { href: '/profile', label: 'Profile', icon: HiOutlineUser },
  { href: '/settings', label: 'Settings', icon: HiOutlineCog },
] as const;

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-bezamint-border bg-bezamint-surface/95 backdrop-blur-sm flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 h-16 border-b border-bezamint-border">
        <BezaMintLogo size={32} />
        <span className="text-xl font-bold text-gradient">BezaMint</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
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
                  isActive
                    ? 'text-bezamint-secondary'
                    : 'text-gray-500 group-hover:text-gray-300'
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

      {/* Footer */}
      <div className="px-6 py-4 border-t border-bezamint-border">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="w-1.5 h-1.5 rounded-full bg-bezamint-primary animate-pulse" />
          Stellar Testnet
        </div>
      </div>
    </aside>
  );
}

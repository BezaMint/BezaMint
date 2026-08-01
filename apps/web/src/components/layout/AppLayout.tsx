'use client';

import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileMenu from './MobileMenu';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      {/* Mobile hamburger */}
      <MobileMenu />
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

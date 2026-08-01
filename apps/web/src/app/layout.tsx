import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import { WalletProvider, ToastProvider } from '@/context';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'BezaMint — NFT Creation on Stellar',
    template: '%s | BezaMint',
  },
  description:
    'A comprehensive NFT creation and digital asset management platform built on the Stellar network using Soroban smart contracts.',
  keywords: ['NFT', 'Stellar', 'Soroban', 'minting', 'digital assets', 'blockchain', 'crypto'],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col">
        <ToastProvider>
          <WalletProvider>
            {children}
          </WalletProvider>
        </ToastProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 5000,
          }}
        />
      </body>
    </html>
  );
}

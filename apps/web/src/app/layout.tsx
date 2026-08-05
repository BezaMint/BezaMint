import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import { WalletProvider, ToastProvider } from '@/context';
import '@/styles/globals.css';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bezamint.vercel.app';
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'BezaMint';

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'BezaMint — NFT Creation on Stellar',
    template: '%s | BezaMint',
  },
  description:
    'A comprehensive NFT creation and digital asset management platform built on the Stellar network using Soroban smart contracts.',
  keywords: ['NFT', 'Stellar', 'Soroban', 'minting', 'digital assets', 'blockchain', 'crypto'],
  authors: [{ name: 'BezaMint Contributors' }],
  applicationName: APP_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: 'BezaMint — NFT Creation on Stellar',
    description:
      'Mint NFTs, manage collections, configure royalties, and verify ownership — all on-chain with Soroban smart contracts.',
    url: APP_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BezaMint — NFT Creation on Stellar',
    description:
      'Mint NFTs, manage collections, configure royalties, and verify ownership on Stellar.',
  },
  alternates: {
    canonical: '/',
  },
};

export const viewport: Viewport = {
  themeColor: '#06271a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col">
        <ToastProvider>
          <WalletProvider>{children}</WalletProvider>
        </ToastProvider>
        <Toaster
          position="bottom-right"
          containerStyle={{ bottom: 20 }}
          toastOptions={{
            duration: 5000,
          }}
        />
        {process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID && (
          <script
            defer
            src="/_vercel/insights/script.js"
            data-token={process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID}
          />
        )}
      </body>
    </html>
  );
}

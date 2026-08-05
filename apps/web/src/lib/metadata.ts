import type { Metadata } from 'next';

const SITE_NAME = 'BezaMint';
const SITE_DESCRIPTION =
  'A comprehensive NFT creation and digital asset management platform built on the Stellar network using Soroban smart contracts.';
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bezamint.vercel.app';

/** Generate page-specific metadata with sensible defaults */
export function createMetadata({
  title,
  description,
  path = '',
}: {
  title: string;
  description?: string;
  path?: string;
}): Metadata {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const desc = description || SITE_DESCRIPTION;
  const url = `${BASE_URL}${path}`;

  return {
    title: fullTitle,
    description: desc,
    openGraph: {
      title: fullTitle,
      description: desc,
      url,
      siteName: SITE_NAME,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: desc,
    },
    alternates: {
      canonical: url,
    },
  };
}

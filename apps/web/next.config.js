/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // Tracing must start at the monorepo root, not at apps/web. Workspace
  // dependencies resolve through node_modules above this package (the shared
  // package is imported by path, and pnpm stores packages in a store beside the
  // root), so a root of apps/web makes the tracer treat those files as outside
  // the output and copy nothing — producing a standalone server that cannot
  // start. Tracing from the root captures them at their real locations.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  poweredByHeader: false,
  // gzip compression for the self-hosted server; CDN deployments (Vercel)
  // compress at the edge instead.
  compress: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      // Only allow images from known NFT gateways and Unsplash (demo assets)
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: 'nftstorage.link' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

// Enable experimental features for production
if (process.env.NODE_ENV === 'production') {
  nextConfig.experimental = {
    optimizePackageImports: ['react-icons'],
  };
}

module.exports = nextConfig;

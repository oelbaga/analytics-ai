import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Vercel serverless functions can run up to 30s — GA4 + MySQL may need it
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
  },
};

export default nextConfig;

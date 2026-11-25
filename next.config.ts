import type { NextConfig } from 'next';

const isDesktopExport = process.env.NEXT_EXPORT === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(isDesktopExport
    ? {
        output: 'export',
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default nextConfig;

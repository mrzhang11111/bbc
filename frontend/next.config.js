// @ts-check
const path = require('node:path');

const withPwa = require('next-pwa');

/**
 * @type {import('next').NextConfig}
 * */
const nextConfig = {
  images: {
    domains: ['s4.anilist.co', 'media.kitsu.io'],
    disableStaticImages: true,
  },
  poweredByHeader: false,
  experimental: {
    outputStandalone: true,
    outputFileTracingRoot: path.join(__dirname, '../'),
  },
  transpilePackages: ['@animeflix/api'],
};

module.exports = withPwa({
  ...nextConfig,
  pwa: {
    dest: 'public',
    // Temporarily disable PWA to allow Monetag verification
    disable: true,
    // Use different SW filename to avoid conflict with Monetag verification
    swSrc: 'service-worker.js',
    swDest: 'service-worker.js',
  },
});

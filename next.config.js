/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.mlstatic.com' },
      { protocol: 'http', hostname: '*.mlstatic.com' },
    ],
  },
};
module.exports = nextConfig;

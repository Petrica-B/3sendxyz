import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'pino-pretty': path.resolve(process.cwd(), 'stubs/pino-pretty.js'),
    };
    return config;
  },
};

export default nextConfig;

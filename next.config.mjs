import path from 'path';

const alias = {
  '@react-native-async-storage/async-storage': path.resolve(
    process.cwd(),
    'stubs/react-native-async-storage.ts'
  ),
  'pino-pretty': path.resolve(process.cwd(), 'stubs/pino-pretty.js'),
};

const turbopackAlias = Object.fromEntries(
  Object.entries(alias).map(([key, absPath]) => [
    key,
    path.relative(process.cwd(), absPath).replace(/\\/g, '/'),
  ])
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: turbopackAlias,
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      ...alias,
    };
    return config;
  },
  output: 'standalone',
};

export default nextConfig;

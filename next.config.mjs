import path from 'path';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@react-native-async-storage/async-storage': path.resolve(
        process.cwd(),
        'stubs/react-native-async-storage.ts'
      ),
      'pino-pretty': path.resolve(process.cwd(), 'stubs/pino-pretty.js'),
    };
    return config;
  },
  output: 'standalone',
};

export default nextConfig;

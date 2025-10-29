'use client';

import { RainbowKitProvider, getDefaultConfig, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import type { Config } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

type GlobalWithWagmi = typeof globalThis & {
  wagmiConfig?: Config;
};

const globalWithWagmi = globalThis as GlobalWithWagmi;

if (!globalWithWagmi.wagmiConfig) {
  globalWithWagmi.wagmiConfig = getDefaultConfig({
    appName: '3send.xyz',
    projectId: projectId || 'demo',
    chains: [baseSepolia, base],
    ssr: true,
  });
}

const config = globalWithWagmi.wagmiConfig;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            borderRadius: 'small',
            accentColor: '#F7931A',
            accentColorForeground: '#ffffff',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

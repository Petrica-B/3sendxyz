'use client';

import { REQUIRED_CHAIN_ID, SUPPORTED_CHAINS } from '@/lib/constants';
import { RainbowKitProvider, getDefaultConfig, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { sdk } from '@farcaster/miniapp-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import type { Config } from 'wagmi';
import { WagmiProvider } from 'wagmi';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

type GlobalWithWagmi = typeof globalThis & {
  wagmiConfig?: Config;
};

const globalWithWagmi = globalThis as GlobalWithWagmi;

if (!globalWithWagmi.wagmiConfig) {
  globalWithWagmi.wagmiConfig = getDefaultConfig({
    appName: '3send.xyz',
    projectId: projectId || 'demo',
    chains: [...SUPPORTED_CHAINS],
    ssr: true,
  });
}

const config = globalWithWagmi.wagmiConfig;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!('farcaster' in window)) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('Mini app environment not detected; skipping ready() call');
      }
      return;
    }

    sdk.actions.ready().catch((error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('Mini app ready() failed', error);
      }
    });
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={REQUIRED_CHAIN_ID}
          theme={lightTheme({
            borderRadius: 'small',
            accentColor: '#F7931A',
            accentColorForeground: '#ffffff',
          })}
        >
          {children}
        </RainbowKitProvider>
        <ToastContainer
          position="bottom-right"
          autoClose={4000}
          hideProgressBar
          newestOnTop
          closeOnClick
          pauseOnFocusLoss
          pauseOnHover
          draggable={false}
          theme="light"
        />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

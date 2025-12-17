import { Footer } from '@/components/Footer';
import MobileTabBar from '@/components/MobileTabBar';
import { Navbar } from '@/components/Navbar';
import { Providers } from '@/components/Providers';
import { buildMiniAppEmbedMetadata } from '@/lib/miniapp';
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';

const baseMetadata: Metadata = {
  title: '3send.xyz — P2P File Transfer',
  description: 'P2P file transfer dapp using Ratio1 with Base wallet connect.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/favicon.ico'],
  },
  manifest: '/site.webmanifest',
};

export async function generateMetadata(): Promise<Metadata> {
  const baseOther = baseMetadata.other as Record<string, string | number | (string | number)[]> | undefined;

  return {
    ...baseMetadata,
    other: {
      ...(baseOther ?? {}),
      'fc:miniapp': JSON.stringify(buildMiniAppEmbedMetadata()),
    },
  };
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
};

const googleAnalyticsId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {googleAnalyticsId ? (
            <>
              <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
                strategy="afterInteractive"
              />
              <Script id="ga-init" strategy="afterInteractive">
                {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${googleAnalyticsId}');`}
              </Script>
            </>
          ) : null}
          <Providers>
            <Navbar />
            <div className="container">{children}</div>
            <Footer />
            <MobileTabBar />
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}

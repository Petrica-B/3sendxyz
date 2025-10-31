import { Footer } from '@/components/Footer';
import MobileTabBar from '@/components/MobileTabBar';
import { Navbar } from '@/components/Navbar';
import { Providers } from '@/components/Providers';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '3send.xyz — P2P File Transfer',
  description: 'P2P file transfer dapp using ratio1 with Base wallet connect.',
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
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Navbar />
          <div className="container">{children}</div>
          <Footer />
          <MobileTabBar />
        </Providers>
      </body>
    </html>
  );
}

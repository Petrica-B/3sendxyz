import { Footer } from '@/components/Footer';
import MobileTabBar from '@/components/MobileTabBar';
import { Navbar } from '@/components/Navbar';
import { Providers } from '@/components/Providers';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '3send.xyz — P2P File Transfer (Mock)',
  description: 'Mockup for P2P file transfer dapp using ratio1 with Base wallet connect.',
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

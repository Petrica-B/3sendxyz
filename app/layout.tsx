import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Source_Code_Pro } from 'next/font/google';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import MobileTabBar from '@/components/MobileTabBar';

export const metadata: Metadata = {
  title: '3send.xyz — P2P File Transfer (Mock)',
  description: 'Mockup for P2P file transfer dapp using ratio1 with Base wallet connect.',
};

const sourceCodePro = Source_Code_Pro({ subsets: ['latin'], display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={sourceCodePro.className}>
        <Providers>
          <Navbar />
          <div className="container">
            {children}
          </div>
          <Footer />
          <MobileTabBar />
        </Providers>
      </body>
    </html>
  );
}

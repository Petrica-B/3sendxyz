import Dashboard from '@/components/Dashboard';
import HomeCta from '@/components/HomeCta';
import LogoPixelAnimation from '@/components/LogoPixelAnimation';
import WelcomeModal from '@/components/WelcomeModal';
import { getCachedPlatformStats } from '@/lib/stats';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '3send.xyz - Wallet‑to‑Wallet Encrypted File Transfer',
  description:
    'Send encrypted files wallet‑to‑wallet on Base via Ratio1. End‑to‑end encryption, no accounts, pay with R1, ETH, or USDC.',
  openGraph: {
    title: '3send.xyz - Wallet‑to‑Wallet Encrypted File Transfer',
    description:
      'Send encrypted files wallet‑to‑wallet on Base via Ratio1. End‑to‑end encryption, no accounts, pay with R1, ETH, or USDC.',
    images: [{ url: '/Home.png', width: 1200, height: 630, alt: '3send', type: 'image/png' }],
    siteName: '3send.xyz',
  },
  twitter: {
    card: 'summary_large_image',
    title: '3send.xyz - Wallet‑to‑Wallet Encrypted File Transfer',
    description:
      'Send encrypted files wallet‑to‑wallet on Base via Ratio1. End‑to‑end encryption, no accounts, pay with R1, ETH, or USDC.',
    images: [{ url: 'https://3send.xyz/Home.png', alt: '3send' }],
  },
};

export default async function Home() {
  const platformStats = await getCachedPlatformStats();
  return (
    <main className="col" style={{ gap: 24 }}>
      <WelcomeModal />
      <section className="hero">
        <div className="headline">
          Send files wallet-to-wallet
          <span> </span>
          <span className="gradientText">on Base</span>
          <span> via </span>
          <span className="gradientText">Ratio1</span>
        </div>
        <div className="subhead">
          End-to-end encrypted, decentralized file transfer. Hold the keys, hold the data.
        </div>
        <div style={{ marginTop: 16, height: 220, position: 'relative' }}>
          <LogoPixelAnimation src="/3sendClear.svg" fill pixelSize={3} impactRadius={32} />
        </div>
      </section>

      <HomeCta />

      <Dashboard initialPlatformStats={platformStats} />
    </main>
  );
}

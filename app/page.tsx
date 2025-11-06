import Dashboard from '@/components/Dashboard';
import HomeCta from '@/components/HomeCta';
import LogoPixelAnimation from '@/components/LogoPixelAnimation';
import WelcomeModal from '@/components/WelcomeModal';
import { getCachedPlatformStats } from '@/lib/stats';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

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

      <section aria-labelledby="how-it-works-title" className="card col" style={{ gap: 12 }}>
        <div id="how-it-works-title" style={{ fontWeight: 800, fontSize: 16 }}>
          How it works
        </div>
        <div className="welcomeSteps" aria-label="How it works steps">
          {/* Step 1 */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              1
            </span>
            <Image className="welcomeStepIcon" src="/Connect.svg" alt="" width={40} height={40} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Connect your wallet.</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Start instantly - no accounts or setup required.
            </div>
          </div>
          {/* Step 2 */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              2
            </span>
            <Image className="welcomeStepIcon" src="/Upload.svg" alt="" width={40} height={40} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              Select files and a recipient address.
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Choose what to send and who receives it.
            </div>
          </div>
          {/* Step 3 */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              3
            </span>
            <Image className="welcomeStepIcon" src="/Lock.svg" alt="" width={40} height={40} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              Encrypt locally and send decentralized.
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Your files are sealed on your device and delivered via the Ratio1 network.
            </div>
          </div>
          {/* Step 4 */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              4
            </span>
            <Image className="welcomeStepIcon" src="/Unlock.svg" alt="" width={40} height={40} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Recipient decrypts in their inbox.</div>
            <div className="muted" style={{ fontSize: 12 }}>
              The recipient unlocks the file privately with their wallet.
            </div>
          </div>
        </div>
        <div className="homeCtaActions" style={{ justifyContent: 'flex-end', width: '100%' }}>
          <Link
            href="/docs"
            className="button"
            style={{ textDecoration: 'none' }}
            aria-label="Read more"
            title="Read more"
          >
            Read more
          </Link>
          <Link
            href="/send"
            className="button accent"
            style={{ textDecoration: 'none' }}
            aria-label="Start sending"
            title="Start sending"
          >
            Start sending
          </Link>
        </div>
      </section>
      <Dashboard initialPlatformStats={platformStats} />
      <section
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>Questions or feedback?</div>
          <div className="muted" style={{ fontSize: 12 }}>
            If you have more questions or any feedback, we’d love to hear it. Anything helps 3send
            serve privacy‑concerned people and businesses better.
          </div>
        </div>
        <div className="homeCtaActions">
          <a
            href="https://t.me/threesendxyz"
            target="_blank"
            rel="noreferrer"
            className="button accent"
            title="Join Telegram"
            aria-label="Join Telegram"
          >
            Join our Telegram
          </a>
        </div>
      </section>
    </main>
  );
}

import Dashboard from '@/components/Dashboard';
import HomeCta from '@/components/HomeCta';
import LogoPixelAnimation from '@/components/LogoPixelAnimation';
import { getCachedPlatformStats } from '@/lib/stats';

export default async function Home() {
  const platformStats = await getCachedPlatformStats();
  return (
    <main className="col" style={{ gap: 24 }}>
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

import Dashboard from '@/components/Dashboard';
import HomeCta from '@/components/HomeCta';
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
      </section>

      <HomeCta />

      <Dashboard initialPlatformStats={platformStats} />
    </main>
  );
}

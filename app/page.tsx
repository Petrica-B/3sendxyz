import Dashboard from '@/components/Dashboard';
import HomeCta from '@/components/HomeCta';

export default function Home() {
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
        <div className="subhead">End‑to‑end encrypted, decentralized file transfer. You hold the keys.</div>
      </section>

      <HomeCta />

      <Dashboard />
    </main>
  );
}

import Link from 'next/link';
import Dashboard from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="col" style={{ gap: 24 }}>
      <section className="hero">
        <div className="headline">
          Send files wallet-to-wallet
          <span> </span>
          <span className="gradientText">on Base</span>
        </div>
        <div className="subhead">End-to-end, p2p-inspired flow using a ratio1 mock.</div>
      </section>

      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Get started</div>
          <div className="muted" style={{ fontSize: 12 }}>Connect your wallet, then use Outbox to send and Inbox to receive.</div>
        </div>
        <Link href="/outbox" className="button" style={{ textDecoration: 'none' }}>Open Outbox</Link>
      </div>

      <Dashboard />
    </main>
  );
}

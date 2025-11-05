import { SendFileCard } from '@/components/SendFileCard';

export const dynamic = 'force-dynamic';

export default function SendPage() {
  return (
    <main className="col" style={{ gap: 24 }}>
      <div className="hero">
        <div className="headline">Send</div>
        <div className="subhead">Send encrypted files to another wallet.</div>
      </div>
      <SendFileCard />
    </main>
  );
}


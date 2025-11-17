"use client";

import { SendFileCard } from '@/components/SendFileCard';
import { useAccount } from 'wagmi';

export default function SendPage() {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Send</div>
          <div className="subhead">Connect your wallet to send files.</div>
        </div>
      </main>
    );
  }

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

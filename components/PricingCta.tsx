'use client';

import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export default function PricingCta() {
  const { isConnected } = useAccount();

  if (isConnected) {
    return (
      <div
        className="card"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>Ready to send?</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Go to Outbox and start sending. Pricing updates automatically based on your file size.
          </div>
        </div>
        <div className="homeCtaActions">
          <Link href="/outbox" className="button" style={{ textDecoration: 'none' }}>
            Go to Outbox
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <div
          className="card"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Ready to send?</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Connect your wallet to start sending. Pricing adjusts automatically based on your file size.
            </div>
          </div>
          <div className="homeCtaActions">
            <button type="button" className="button" onClick={openConnectModal}>
              Connect Now
            </button>
          </div>
        </div>
      )}
    </ConnectButton.Custom>
  );
}

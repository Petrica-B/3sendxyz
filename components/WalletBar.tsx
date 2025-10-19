'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export function WalletBar() {
  const { address, chain } = useAccount();
  return (
    <div
      className="card"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>Wallet</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {address ? `Connected${chain ? ` on ${chain.name}` : ''}` : 'Not connected'}
        </div>
      </div>
      <ConnectButton showBalance={false} />
    </div>
  );
}

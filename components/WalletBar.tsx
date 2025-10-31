'use client';

import { REQUIRED_CHAIN_ID, REQUIRED_CHAIN_NAME } from '@/lib/constants';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export function WalletBar() {
  const { address, chain } = useAccount();
  const wrongNetwork = Boolean(chain?.id && chain.id !== REQUIRED_CHAIN_ID);
  const statusCopy = address
    ? wrongNetwork
      ? `Wrong network${chain?.name ? `: ${chain.name}` : ''}. Switch to ${REQUIRED_CHAIN_NAME}.`
      : `Connected${chain ? ` on ${chain.name}` : ''}`
    : 'Not connected';
  return (
    <div
      className="card"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>Wallet</div>
        <div className="muted" style={{ fontSize: 12, color: wrongNetwork ? '#dc2626' : '#6b7280' }}>
          {statusCopy}
        </div>
      </div>
      <ConnectButton showBalance={false} />
    </div>
  );
}

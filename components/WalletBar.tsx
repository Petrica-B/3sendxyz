'use client';

import { LoginButton } from '@/components/LoginButton';
import { REQUIRED_CHAIN_ID, REQUIRED_CHAIN_NAME } from '@/lib/constants';
import { useAuthStatus } from '@/lib/useAuthStatus';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export function WalletBar() {
  const { canUseWallet, isLoggedIn } = useAuthStatus();
  const { chain } = useAccount();
  const walletActive = canUseWallet;
  const wrongNetwork = Boolean(chain?.id && chain.id !== REQUIRED_CHAIN_ID);
  const statusCopy = walletActive
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
      {walletActive ? (
        <ConnectButton showBalance={false} />
      ) : isLoggedIn ? (
        <span className="muted" style={{ fontSize: 12 }}>
          Wallet disconnected
        </span>
      ) : (
        <LoginButton />
      )}
    </div>
  );
}

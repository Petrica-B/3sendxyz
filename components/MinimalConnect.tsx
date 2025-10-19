'use client';

import { shortAddress } from '@/lib/format';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export function MinimalConnect() {
  const { address, isConnected } = useAccount();
  return (
    <ConnectButton.Custom>
      {({ openAccountModal, openConnectModal }) => (
        <button
          type="button"
          className="button"
          onClick={isConnected ? openAccountModal : openConnectModal}
        >
          {isConnected ? shortAddress(address || '', 4) : 'Connect Wallet'}
        </button>
      )}
    </ConnectButton.Custom>
  );
}

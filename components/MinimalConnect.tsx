'use client';

import { IdentityBadge } from '@/components/IdentityBadge';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function MinimalConnect() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;

        return (
          <div
            {...(!mounted && {
              'aria-hidden': true,
              style: {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button onClick={openConnectModal} className="button" type="button">
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button onClick={openChainModal} className="button" type="button">
                    Switch Network
                  </button>
                );
              }

              return (
                <button
                  onClick={openAccountModal}
                  className="button"
                  type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  {account?.address ? (
                    <IdentityBadge address={account.address} size={4} basicStyle={true} />
                  ) : (
                    account.displayName
                  )}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

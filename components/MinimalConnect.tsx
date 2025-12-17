'use client';

import { IdentityBadge } from '@/components/IdentityBadge';
import { LoginButton } from '@/components/LoginButton';
import { useAuthStatus } from '@/lib/useAuthStatus';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export function MinimalConnect() {
  const { authMethod } = useAuthStatus();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, mounted }) => {
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
                if (authMethod === 'clerk') {
                  return (
                    <button
                      className="button"
                      type="button"
                      disabled
                      title="Sign out of email login to connect a wallet."
                    >
                      Email login active
                    </button>
                  );
                }
                if (authMethod === 'mixed') {
                  return (
                    <button
                      className="button"
                      type="button"
                      disabled
                      title="Disconnect one login method to continue."
                    >
                      Multiple logins active
                    </button>
                  );
                }
                return <LoginButton />;
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
                    <IdentityBadge
                      address={account.address}
                      size={4}
                      basicStyle={true}
                      nameMaxLength={15}
                    />
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

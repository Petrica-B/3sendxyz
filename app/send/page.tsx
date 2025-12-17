'use client';

import { LoginButton } from '@/components/LoginButton';
import { SendFileCard } from '@/components/SendFileCard';
import { useAuthStatus } from '@/lib/useAuthStatus';

export default function SendPage() {
  const { authMethod, canUseWallet, isLoggedIn } = useAuthStatus();

  if (!canUseWallet) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Send</div>
          <div className="subhead">
            {authMethod === 'clerk'
              ? 'Email login is active. Sign out to connect a wallet.'
              : authMethod === 'mixed'
                ? 'Multiple logins active. Disconnect one to continue.'
                : 'Log in to send files.'}
          </div>
          {!isLoggedIn && (
            <div style={{ marginTop: 12 }}>
              <LoginButton />
            </div>
          )}
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

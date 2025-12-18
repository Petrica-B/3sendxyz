'use client';

import { LoginButton } from '@/components/LoginButton';
import { SendFileCard } from '@/components/SendFileCard';
import { useAuthStatus } from '@/lib/useAuthStatus';

export default function SendPage() {
  const { authMethod, isLoggedIn, identityValue } = useAuthStatus();

  if (!isLoggedIn) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Send</div>
          <div className="subhead">Log in to send files.</div>
          <div style={{ marginTop: 12 }}>
            <LoginButton />
          </div>
        </div>
      </main>
    );
  }

  if (!identityValue && authMethod === 'mixed') {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Send</div>
          <div className="subhead">Multiple logins active. Sign out of one to continue.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="col" style={{ gap: 24 }}>
      <div className="hero">
        <div className="headline">Send</div>
        <div className="subhead">Send encrypted files to anyone.</div>
      </div>
      <SendFileCard />
    </main>
  );
}

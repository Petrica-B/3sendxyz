'use client';

import { LoginButton } from '@/components/LoginButton';
import { useAuthStatus } from '@/lib/useAuthStatus';
import Link from 'next/link';

export default function PricingCta() {
  const { authMethod, canUseWallet } = useAuthStatus();

  if (canUseWallet) {
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

  if (authMethod === 'clerk') {
    return (
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>Email login active</div>
          <div className="muted" style={{ fontSize: 12 }}>
            To use a wallet instead, sign out of email login first.
          </div>
        </div>
      </div>
    );
  }

  if (authMethod === 'mixed') {
    return (
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>Multiple logins active</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Disconnect one login method to continue.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
    >
      <div>
        <div style={{ fontWeight: 700 }}>Ready to send?</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Log in with email or connect a wallet to start sending.
        </div>
      </div>
      <div className="homeCtaActions">
        <LoginButton label="Login" />
      </div>
    </div>
  );
}

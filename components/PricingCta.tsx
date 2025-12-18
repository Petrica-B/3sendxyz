'use client';

import { LoginButton } from '@/components/LoginButton';
import { useAuthStatus } from '@/lib/useAuthStatus';
import Link from 'next/link';

export default function PricingCta() {
  const { isLoggedIn, identityValue, authMethod } = useAuthStatus();

  if (isLoggedIn && identityValue) {
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

  if (isLoggedIn && !identityValue && authMethod === 'mixed') {
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
            Sign out of one login method to continue.
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

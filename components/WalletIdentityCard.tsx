'use client';

import { shortAddress } from '@/lib/format';
import { fetchIdentityProfile, identityQueryKey } from '@/lib/identity';
import { parseIdentityKey } from '@/lib/identityKey';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';

type WalletIdentityCardProps = {
  identity?: string;
  label: string;
};

export function WalletIdentityCard({ identity, label }: WalletIdentityCardProps) {
  const parsed = useMemo(() => (identity ? parseIdentityKey(identity) : null), [identity]);
  const normalized = parsed?.kind === 'wallet' ? parsed.value : '';
  const emailValue = parsed?.kind === 'email' ? parsed.value : '';
  const enabled = Boolean(parsed?.value);

  const { data } = useQuery({
    queryKey: identityQueryKey(normalized || 'pending-identity'),
    queryFn: () => fetchIdentityProfile(normalized),
    enabled: Boolean(normalized),
    staleTime: 30 * 60 * 1000,
  });

  const baseName = data?.name?.trim();
  const short = normalized ? shortAddress(normalized, 4) : '';

  const copyValue = useCallback(
    async (value: string, type: 'address' | 'basename' | 'email') => {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        const labelText =
          type === 'email' ? 'Email' : type === 'address' ? 'Address' : 'Basename';
        toast.success(`${labelText} copied.`);
      } catch (err) {
        console.error('[wallet-identity-card] copy failed', err);
        toast.error('Unable to copy to clipboard.');
      }
    },
    []
  );

  if (!enabled) return null;

  return (
    <div
      className="card col"
      style={{ gap: 6, alignSelf: 'flex-start', width: 'fit-content', maxWidth: '100%' }}
    >
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div className="col" style={{ gap: 4 }}>
        {baseName ? (
          <button
            type="button"
            onClick={() => copyValue(baseName, 'basename')}
            aria-label={`Copy ${label} basename`}
            title={`Copy ${label} basename`}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              textAlign: 'left',
              color: 'var(--accent)',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {baseName}
          </button>
        ) : null}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--accent)',
          }}
        >
          <button
            type="button"
            onClick={() => copyValue(parsed?.value ?? '', parsed?.kind === 'email' ? 'email' : 'address')}
            aria-label={`Copy ${label} ${parsed?.kind === 'email' ? 'email' : 'address'}`}
            title={`Copy ${label} ${parsed?.kind === 'email' ? 'email' : 'address'}`}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>
              {emailValue || short}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { shortAddress } from '@/lib/format';
import { fetchIdentityProfile, identityQueryKey } from '@/lib/identity';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';

type WalletIdentityCardProps = {
  address?: string;
  label: string;
};

export function WalletIdentityCard({ address, label }: WalletIdentityCardProps) {
  const normalized = useMemo(() => address?.trim().toLowerCase() ?? '', [address]);
  const enabled = normalized.length > 0;

  const { data, isFetching, isError } = useQuery({
    queryKey: identityQueryKey(normalized || 'pending-identity'),
    queryFn: () => fetchIdentityProfile(normalized),
    enabled,
    staleTime: 30 * 60 * 1000,
  });

  const baseName = data?.name?.trim();
  const short = normalized ? shortAddress(normalized, 4) : '';

  const copyValue = useCallback(async (value: string, type: 'address' | 'basename') => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${type === 'address' ? 'Address' : 'Basename'} copied.`);
    } catch (err) {
      console.error('[wallet-identity-card] copy failed', err);
      toast.error('Unable to copy to clipboard.');
    }
  }, []);

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
            onClick={() => copyValue(normalized, 'address')}
            aria-label={`Copy ${label} address`}
            title={`Copy ${label} address`}
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
              {short}
            </span>
          </button>
          {isFetching ? (
            <span className="muted" style={{ fontSize: 11 }}>
              Resolving…
            </span>
          ) : isError ? (
            <span className="muted" style={{ fontSize: 11 }}>
              Unable to resolve name
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

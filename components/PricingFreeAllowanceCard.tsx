'use client';

import { FREE_MICRO_SENDS_PER_MONTH } from '@/lib/constants';
import { formatDateShort } from '@/lib/format';
import type { FreeSendAllowance } from '@/lib/types';
import { useAuthStatus } from '@/lib/useAuthStatus';
import { useQuery } from '@tanstack/react-query';

function formatResetDate(ts?: number) {
  if (!ts) return null;
  return formatDateShort(ts);
}

export function PricingFreeAllowanceCard() {
  const { authMethod, isLoggedIn, identityValue } = useAuthStatus();
  const identity = identityValue ?? '';

  const { data, isLoading, isError } = useQuery<FreeSendAllowance>({
    queryKey: ['pricing-free-allowance', identity],
    enabled: Boolean(isLoggedIn && identity),
    staleTime: 60_000,
    queryFn: async () => {
      if (!identity) {
        throw new Error('Missing identity');
      }
      const res = await fetch(`/api/send/freeAllowance?identity=${encodeURIComponent(identity)}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success || !payload.allowance) {
        const msg =
          typeof payload?.error === 'string' && payload.error.trim().length > 0
            ? payload.error
            : 'Failed to fetch free allowance';
        throw new Error(msg);
      }
      return payload.allowance as FreeSendAllowance;
    },
  });

  const allowance = data ?? null;
  const remaining = allowance?.remaining ?? FREE_MICRO_SENDS_PER_MONTH;
  const limit = allowance?.limit ?? FREE_MICRO_SENDS_PER_MONTH;
  const resets = formatResetDate(allowance?.resetsAt);

  return (
    <div
      className="card"
      style={{
        border: '1px dashed var(--accent)',
        background: '#fffbeb',
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Monthly free micro-sends</div>
      <div className="muted" style={{ fontSize: 12 }}>
        Every account gets {FREE_MICRO_SENDS_PER_MONTH} free Micro Sends (up to 50 MB) each month.
        Free credits reset at the start of every month; once you use them, Micro tier pricing
        applies automatically.
      </div>
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
        {!isLoggedIn ? (
          'Log in to see your remaining free sends.'
        ) : !identity ? (
          authMethod === 'mixed'
            ? 'Multiple logins active. Sign out of one to continue.'
            : 'Select a login method to continue.'
        ) : isLoading ? (
          'Checking your free sends…'
        ) : isError || !allowance ? (
          'Unable to load your free sends right now.'
        ) : (
          <>
            You have {remaining} out of {limit} free micro-sends left this month
            {resets && remaining !== limit ? ` · resets on ${resets}` : ''}.
          </>
        )}
      </div>
    </div>
  );
}

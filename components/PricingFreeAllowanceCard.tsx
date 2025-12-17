'use client';

import { FREE_MICRO_SENDS_PER_MONTH } from '@/lib/constants';
import { formatDateShort } from '@/lib/format';
import type { FreeSendAllowance } from '@/lib/types';
import { useAuthStatus } from '@/lib/useAuthStatus';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';

function formatResetDate(ts?: number) {
  if (!ts) return null;
  return formatDateShort(ts);
}

export function PricingFreeAllowanceCard() {
  const { authMethod, canUseWallet } = useAuthStatus();
  const { address } = useAccount();
  const walletActive = canUseWallet;

  const { data, isLoading, isError } = useQuery<FreeSendAllowance>({
    queryKey: ['pricing-free-allowance', address],
    enabled: Boolean(walletActive && address),
    staleTime: 60_000,
    queryFn: async () => {
      if (!address) {
        throw new Error('Missing address');
      }
      const res = await fetch(`/api/send/freeAllowance?address=${encodeURIComponent(address)}`);
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
        Every wallet gets {FREE_MICRO_SENDS_PER_MONTH} free Micro Sends (up to 50 MB) each month.
        Free credits reset at the start of every month; once you use them, Micro tier pricing
        applies automatically.
      </div>
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: '#0f172a' }}>
        {!walletActive ? (
          authMethod === 'clerk'
            ? 'Email login is active. Sign out to check wallet allowance.'
            : authMethod === 'mixed'
              ? 'Multiple logins active. Disconnect one to check wallet allowance.'
              : 'Connect your wallet to see your remaining free sends.'
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

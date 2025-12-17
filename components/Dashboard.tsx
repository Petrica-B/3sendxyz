'use client';

import { formatBytes } from '@/lib/format';
import type { AddressStatsRecord, PlatformStatsRecord } from '@/lib/types';
import { useAuthStatus } from '@/lib/useAuthStatus';
import { useEffect, useMemo, useState } from 'react';
// Removed full-card loader in favor of per-card skeletons
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

const BYTES_IN_GB = 1024 * 1024 * 1024;

function createEmptyPlatformStats(): PlatformStatsRecord {
  return {
    totalSentFiles: 0,
    uniqueUsers: 0,
    totalBytesSent: 0,
    totalR1Burned: '0',
    updatedAt: 0,
  };
}

function createEmptyAddressStats(address = ''): AddressStatsRecord {
  return {
    address,
    sentFiles: 0,
    sentBytes: 0,
    receivedFiles: 0,
    receivedBytes: 0,
    totalR1Burned: '0',
    updatedAt: 0,
  };
}

function formatR1Amount(value: string): { display: string; precise: string } {
  try {
    const precise = formatUnits(BigInt(value ?? '0'), 18);
    const asNumber = Number(precise);
    const display = Number.isFinite(asNumber)
      ? asNumber.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : precise;
    return { display, precise };
  } catch {
    return { display: '0', precise: '0' };
  }
}

function formatGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0.00';
  }
  const gb = bytes / BYTES_IN_GB;
  if (!Number.isFinite(gb) || gb <= 0) {
    return '0.00';
  }
  const precision = gb >= 10 ? 1 : 2;
  return gb.toFixed(precision);
}

type DashboardProps = {
  initialPlatformStats?: PlatformStatsRecord | null;
};

export default function Dashboard({ initialPlatformStats }: DashboardProps) {
  const { canUseWallet } = useAuthStatus();
  const [platformStats, setPlatformStats] = useState<PlatformStatsRecord>(() =>
    initialPlatformStats ? { ...initialPlatformStats } : createEmptyPlatformStats()
  );
  const [userStats, setUserStats] = useState<AddressStatsRecord>(() => createEmptyAddressStats());
  const [userLoading, setUserLoading] = useState<boolean>(false);

  const { address } = useAccount();

  useEffect(() => {
    let aborted = false;
    async function refreshTotals() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json().catch(() => null);
        if (!aborted && res.ok && data?.success && data.totals) {
          setPlatformStats(data.totals as PlatformStatsRecord);
        }
      } catch {
        // ignore, rely on previous totals
      }
    }
    refreshTotals();
    const onCompleted = () => refreshTotals();
    window.addEventListener('ratio1:upload-completed', onCompleted);
    return () => {
      aborted = true;
      window.removeEventListener('ratio1:upload-completed', onCompleted);
    };
  }, []);

  useEffect(() => {
    let aborted = false;
    async function refreshUserStats() {
      const normalized = address?.toLowerCase() ?? '';
      if (!canUseWallet || !normalized) {
        if (!aborted) {
          setUserStats(createEmptyAddressStats());
          setUserLoading(false);
        }
        return;
      }
      setUserLoading(true);
      try {
        const params = new URLSearchParams({ address: normalized });
        const res = await fetch(`/api/stats?${params.toString()}`);
        const payload = await res.json().catch(() => null);
        if (!aborted) {
          if (res.ok && payload?.success) {
            const nextStats =
              payload.address && typeof payload.address === 'object'
                ? {
                    ...payload.address,
                    address: (payload.address.address ?? normalized).toLowerCase(),
                  }
                : createEmptyAddressStats(normalized);
            setUserStats(nextStats as AddressStatsRecord);
            if (payload.totals) {
              setPlatformStats(payload.totals as PlatformStatsRecord);
            }
          } else {
            setUserStats(createEmptyAddressStats(normalized));
          }
        }
      } catch {
        if (!aborted) {
          setUserStats(createEmptyAddressStats(normalized));
        }
      } finally {
        if (!aborted) setUserLoading(false);
      }
    }
    refreshUserStats();
    const onCompleted = () => refreshUserStats();
    window.addEventListener('ratio1:upload-completed', onCompleted);
    return () => {
      aborted = true;
      window.removeEventListener('ratio1:upload-completed', onCompleted);
    };
  }, [canUseWallet, address]);

  const totalGbSent = formatGb(platformStats.totalBytesSent);
  const platformR1 = useMemo(
    () => formatR1Amount(platformStats.totalR1Burned),
    [platformStats.totalR1Burned]
  );
  const userSentCount = userStats.sentFiles;
  const userInboxCount = userStats.receivedFiles;
  const userBytesSent = userStats.sentBytes;
  const userBytesReceived = userStats.receivedBytes;
  const userR1 = useMemo(() => formatR1Amount(userStats.totalR1Burned), [userStats.totalR1Burned]);
  const userShareUrl = useMemo(() => {
    const lines = [
      `I am sharing files the trustless way using @3sendxyz ⚡️`,
      `${userSentCount} file${userSentCount === 1 ? '' : 's'} (${formatBytes(userBytesSent)}) delivered via @ratio1ai.`,
      `Burned ${userR1.display} $R1 on @base 🔥 for true privacy & decentralization.`,
      ``,
      `Join 3send.xyz - reclaim your digital freedom.`,
    ];
    const text = lines.join('\n');
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  }, [userSentCount, userBytesSent, userR1.display]);

  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Platform&apos;s stats</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginTop: 6,
          }}
        >
          <StatCard label="Total files sent" value={String(platformStats.totalSentFiles)} />
          <StatCard label="Unique users" value={String(platformStats.uniqueUsers)} />
          <StatCard label="Size sent" value={formatBytes(platformStats.totalBytesSent)} />
          <StatCard label="Total R1 burned" value={`${platformR1.display} R1`} />
        </div>
      </div>

      {canUseWallet && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>Your Stats</div>
            {userStats.sentFiles > 0 && (
              <a
                className="button"
                href={userShareUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Share your stats on X"
              >
                Share on 𝕏
              </a>
            )}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginTop: 6,
            }}
          >
            <StatCard label="Files sent" value={String(userSentCount)} loading={userLoading} />
            <StatCard label="Files received" value={String(userInboxCount)} loading={userLoading} />
            <StatCard
              label="Size sent / received"
              value={`${formatBytes(userBytesSent)} / ${formatBytes(userBytesReceived)}`}
              loading={userLoading}
            />
            <StatCard label="R1 burned" value={`${userR1.display} R1`} loading={userLoading} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, hint, loading }: { label: string; value: string; hint?: string; loading?: boolean }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-busy={loading || undefined}>
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div
        style={{
          fontWeight: 800,
          fontSize: 22,
          minHeight: 22,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          lineHeight: 1,
        }}
      >
        {loading ? <span className="spinner spinner-muted spinner-stat" aria-hidden /> : null}
        {!loading ? value : null}
      </div>
      {hint ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

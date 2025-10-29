'use client';

import { formatBytes } from '@/lib/format';
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';

type Stats = {
  totalSentFiles: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  totalBytesSent: number;
};

export default function Dashboard() {
  // Aggregated local (platform sample) stats
  const [stats, setStats] = useState<Stats>({
    totalSentFiles: 0,
    uniqueSenders: 0,
    uniqueReceivers: 0,
    totalBytesSent: 0,
  });
  // Connected user stats
  const { address, isConnected } = useAccount();
  const [userSentCount, setUserSentCount] = useState<number>(0);
  const [userInboxCount, setUserInboxCount] = useState<number>(0);
  const [userBytesSent, setUserBytesSent] = useState<number>(0);
  const [userBytesReceived, setUserBytesReceived] = useState<number>(0);
  const [userLoading, setUserLoading] = useState<boolean>(false);

  useEffect(() => {
    try {
      const senders = new Set<string>();
      const receivers = new Set<string>();
      let sentCount = 0;
      let sentBytes = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;

        if (key.startsWith('outbox:')) {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const arr = JSON.parse(raw) as any[];
            if (!Array.isArray(arr)) continue;
            for (const item of arr) {
              // Count only successfully sent items
              if (item && item.status === 'sent') {
                sentCount += 1;
                if (typeof item.size === 'number' && !isNaN(item.size)) {
                  sentBytes += item.size;
                }
                if (typeof item.to === 'string' && item.to) {
                  receivers.add(item.to.toLowerCase());
                }
              }
            }
          } catch {}
        } else if (key.startsWith('inbox:')) {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const arr = JSON.parse(raw) as any[];
            if (!Array.isArray(arr)) continue;
            for (const item of arr) {
              if (item && typeof item.from === 'string' && item.from) {
                senders.add(item.from.toLowerCase());
              }
            }
          } catch {}
        }
      }

      setStats({
        totalSentFiles: sentCount,
        uniqueSenders: senders.size,
        uniqueReceivers: receivers.size,
        totalBytesSent: sentBytes,
      });
    } catch {
      // ignore errors, keep defaults
    }
  }, []);

  // Fetch connected user's stats from API (mock storage)
  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!isConnected || !address) {
        setUserSentCount(0);
        setUserInboxCount(0);
        setUserBytesSent(0);
        setUserBytesReceived(0);
        setUserLoading(false);
        return;
      }
      setUserLoading(true);
      try {
        const s = new URLSearchParams({ initiator: address });
        const r = new URLSearchParams({ recipient: address });
        const [rs, rr] = await Promise.all([
          fetch(`/api/sent?${s.toString()}`),
          fetch(`/api/inbox?${r.toString()}`),
        ]);
        const [ps, pr] = await Promise.all([
          rs.json().catch(() => null),
          rr.json().catch(() => null),
        ]);
        if (!aborted) {
          const sentRecords = rs.ok && ps?.success && Array.isArray(ps.records) ? ps.records : [];
          const inboxRecords = rr.ok && pr?.success && Array.isArray(pr.records) ? pr.records : [];
          setUserSentCount(sentRecords.length);
          setUserInboxCount(inboxRecords.length);
          setUserBytesSent(
            sentRecords.reduce((acc: number, it: any) => (acc += Number(it?.filesize || 0)), 0)
          );
          setUserBytesReceived(
            inboxRecords.reduce((acc: number, it: any) => (acc += Number(it?.filesize || 0)), 0)
          );
        }
      } catch {
        if (!aborted) {
          setUserSentCount(0);
          setUserInboxCount(0);
          setUserBytesSent(0);
          setUserBytesReceived(0);
        }
      } finally {
        if (!aborted) setUserLoading(false);
      }
    }
    run();
    const onCompleted = () => run();
    window.addEventListener('ratio1:upload-completed', onCompleted);
    return () => {
      aborted = true;
      window.removeEventListener('ratio1:upload-completed', onCompleted);
    };
  }, [isConnected, address]);

  const gb = stats.totalBytesSent / (1024 * 1024 * 1024);
  const userShareUrl = useMemo(() => {
    const parts = [
      `My 3send stats`,
      `Sent ${userSentCount} file${userSentCount === 1 ? '' : 's'} (${formatBytes(userBytesSent)})`,
      `Received ${userInboxCount} file${userInboxCount === 1 ? '' : 's'} (${formatBytes(userBytesReceived)})`,
      `Decentralized, end‑to‑end encrypted on Base`,
      `https://3send.xyz`,
    ];
    const text = parts.join(' — ');
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  }, [userSentCount, userInboxCount, userBytesSent, userBytesReceived]);

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
          <StatCard label="Total files sent" value={String(stats.totalSentFiles)} />
          <StatCard label="Unique senders" value={String(stats.uniqueSenders)} />
          <StatCard label="Unique receivers" value={String(stats.uniqueReceivers)} />
          <StatCard
            label="GB sent"
            value={`${gb.toFixed(2)} GB`}
            hint={formatBytes(stats.totalBytesSent)}
          />
        </div>
      </div>

      {isConnected && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700 }}>Your Stats</div>
            <a
              className="button"
              href={userShareUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Share your stats on X"
            >
              Share on X
            </a>
          </div>
          {userLoading && (
            <div className="muted" style={{ fontSize: 12 }}>
              Loading your stats…
            </div>
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginTop: 6,
            }}
          >
            <StatCard label="Files sent" value={String(userSentCount)} />
            <StatCard label="Files received" value={String(userInboxCount)} />
            <StatCard label="Bytes sent" value={formatBytes(userBytesSent)} />
            <StatCard label="Bytes received" value={formatBytes(userBytesReceived)} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontWeight: 800, fontSize: 22 }}>{value}</div>
      {hint ? (
        <div className="muted" style={{ fontSize: 12 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { formatBytes } from '@/lib/format';
import { useEffect, useState } from 'react';

type Stats = {
  totalSentFiles: number;
  uniqueSenders: number;
  uniqueReceivers: number;
  totalBytesSent: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalSentFiles: 0,
    uniqueSenders: 0,
    uniqueReceivers: 0,
    totalBytesSent: 0,
  });

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

  const gb = stats.totalBytesSent / (1024 * 1024 * 1024);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontWeight: 700 }}>Dashboard</div>
      <div className="muted" style={{ fontSize: 12 }}>
        Aggregated from local app history.
      </div>
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

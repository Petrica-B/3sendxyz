'use client';

import { AddressLink, TxLink } from '@/components/Links';
import { getTierById } from '@/lib/constants';
import { formatBytes, formatDate, formatDateShort } from '@/lib/format';
import type { StoredUploadRecord } from '@/lib/types';
import { useCallback, useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

type ReceivedItem = StoredUploadRecord & { id: string };

const makeRecordId = (record: StoredUploadRecord) => `${record.txHash}:${record.initiator}`;

export default function InboxPage() {
  const { address, isConnected } = useAccount();
  const [records, setRecords] = useState<ReceivedItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  const fetchInbox = useCallback(async () => {
    if (!address) {
      setRecords([]);
      setExpanded({});
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ recipient: address });
      const res = await fetch(`/api/inbox?${params.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to fetch inbox');
      }
      const nextRecords: ReceivedItem[] = Array.isArray(payload.records)
        ? payload.records
            .filter((record: StoredUploadRecord | null) => record && typeof record === 'object')
            .map((record: StoredUploadRecord) => ({ ...record, id: makeRecordId(record) }))
        : [];
      setRecords(nextRecords);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    const handler = () => {
      fetchInbox().catch(() => {});
    };
    window.addEventListener('ratio1:upload-completed', handler);
    return () => {
      window.removeEventListener('ratio1:upload-completed', handler);
    };
  }, [fetchInbox]);

  useEffect(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      for (const record of records) {
        next[record.id] = prev[record.id] ?? false;
      }
      return next;
    });
  }, [records]);

  // Check if user has generated a key pair (profile fingerprint)
  useEffect(() => {
    try {
      if (!address) {
        setHasKey(null);
        return;
      }
      const raw = localStorage.getItem(`profile:${address.toLowerCase()}`);
      if (!raw) {
        setHasKey(false);
        return;
      }
      const parsed = JSON.parse(raw) as { fingerprintHex?: string };
      setHasKey(Boolean(parsed?.fingerprintHex));
    } catch {
      setHasKey(false);
    }
  }, [address]);

  const onDownload = useCallback(async (item: ReceivedItem) => {
    try {
      setDownloadingId(item.id);
      const response = await fetch('/api/inbox/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cid: item.cid,
          recipient: item.recipient,
          filename: item.filename,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success || !payload?.file?.base64) {
        throw new Error(payload?.error || 'Download failed');
      }
      const rawBase64 = payload.file.base64;
      const downloadUrl =
        typeof rawBase64 === 'string' && rawBase64.startsWith('data:')
          ? rawBase64
          : `data:application/octet-stream;base64,${rawBase64 ?? ''}`;
      const fileName =
        payload.file.filename && typeof payload.file.filename === 'string'
          ? payload.file.filename
          : item.filename;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert(message);
    } finally {
      setDownloadingId((current) => (current === item.id ? null : current));
    }
  }, []);

  if (!isConnected || !address) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Inbox</div>
          <div className="subhead">Connect your wallet to see incoming files.</div>
        </div>
      </main>
    );
  }

  if (hasKey === false) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Inbox</div>
          <div className="subhead">Set up your encryption keys to receive and decrypt files.</div>
        </div>
        <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700 }}>Encryption required</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Generate your key pair so files can be delivered and decrypted.
            </div>
          </div>
          <a href="/profile" className="button" style={{ textDecoration: 'none' }}>Go to Profile</a>
        </div>
      </main>
    );
  }

  return (
    <main className="col" style={{ gap: 24 }}>
      <div className="hero">
        <div className="headline">Inbox</div>
        <div className="subhead">Files sent to your wallet.</div>
      </div>

      <section className="col" style={{ gap: 12 }}>
        {loading && (
          <div className="muted" style={{ fontSize: 12 }}>
            Loading inbox…
          </div>
        )}
        {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}
        {!loading && !error && records.length === 0 ? (
          <div className="muted mb-[360px]" style={{ fontSize: 12 }}>
            No files in your inbox yet.
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {records.map((item) => {
              const tier = getTierById(item.tierId);
              let r1Burn: string | null = null;
              let usdBurn: string | null = null;
              try {
                r1Burn = formatUnits(BigInt(item.r1Amount), 18);
              } catch {}
              try {
                usdBurn = formatUnits(BigInt(item.usdcAmount), 6);
              } catch {}
              const r1Display = r1Burn ? Number.parseFloat(r1Burn).toFixed(6) : null;
              const usdDisplay = usdBurn ? Number.parseFloat(usdBurn).toFixed(2) : null;
              return (
                <div key={item.id} className="transferItem">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }} className="mono">
                      {item.filename}
                    </div>
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {formatBytes(item.filesize)} · received {formatDate(item.sentAt)}
                    </div>
                    {expanded[item.id] && (
                      <div className="details mono" style={{ fontSize: 12 }}>
                        <div>
                          from: <AddressLink address={item.initiator} size={5} />
                        </div>
                        <div>
                          tx: <TxLink tx={item.txHash} size={5} />
                        </div>
                        <div>tier: {tier ? tier.label : `Tier ${item.tierId}`}</div>
                        <div>
                          burned: {r1Display ?? '—'} R1 {usdDisplay ? `(≈ ${usdDisplay} USDC)` : ''}
                        </div>
                        <div>note: {item.note ?? '—'}</div>
                        <div>received: {formatDateShort(item.sentAt)}</div>
                      </div>
                    )}
                  </div>
                  <div className="col" style={{ gap: 8, alignItems: 'flex-end' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        className="button"
                        onClick={() => onDownload(item)}
                        disabled={downloadingId === item.id}
                      >
                        {downloadingId === item.id ? 'Downloading…' : 'Download'}
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                        }
                      >
                        {expanded[item.id] ? 'Hide Details' : 'Details'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

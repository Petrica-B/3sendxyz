'use client';

import { AddressLink, TxLink } from '@/components/Links';
import { RoundedLoaderList } from '@/components/RoundedLoader';
import { FILE_EXPIRATION_MS, getTierById } from '@/lib/constants';
import { formatBytes, formatDate, formatDateShort, nextUtcMidnight } from '@/lib/format';
import type { StoredUploadRecord } from '@/lib/types';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { formatUnits } from 'viem';
import { useAccount } from 'wagmi';

type SentItem = StoredUploadRecord & { id: string };

const makeRecordId = (record: StoredUploadRecord) => `${record.txHash}:${record.recipient}`;

export default function OutboxPage() {
  const { address, isConnected } = useAccount();
  const [records, setRecords] = useState<SentItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchSent = useCallback(async () => {
    if (!address) {
      setRecords([]);
      setExpanded({});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ initiator: address });
      const res = await fetch(`/api/sent?${params.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to fetch sent files');
      }
      const nextRecords: SentItem[] = Array.isArray(payload.records)
        ? payload.records
            .filter((record: StoredUploadRecord | null) => record && typeof record === 'object')
            .map((record: StoredUploadRecord) => ({ ...record, id: makeRecordId(record) }))
        : [];
      setRecords(nextRecords);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const friendly =
        message === 'Unknown error' ? 'Unable to load your sent files. Please try again.' : message;
      toast.error(friendly, { toastId: 'outbox-load-error' });
      setError(friendly);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchSent();
  }, [fetchSent]);

  useEffect(() => {
    const handler = () => {
      fetchSent().catch(() => {});
    };
    window.addEventListener('ratio1:upload-completed', handler);
    return () => {
      window.removeEventListener('ratio1:upload-completed', handler);
    };
  }, [fetchSent]);

  useEffect(() => {
    setExpanded((prev) => {
      const next: Record<string, boolean> = {};
      for (const record of records) {
        next[record.id] = prev[record.id] ?? false;
      }
      return next;
    });
    // Reset to first page when records change
    setPage(1);
  }, [records]);

  if (!isConnected || !address) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Outbox</div>
          <div className="subhead">Connect your wallet to see sent files.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="col" style={{ gap: 24 }}>
      <div className="hero">
        <div className="headline">Outbox</div>
        <div className="subhead">Files sent from your wallet.</div>
      </div>

      <section className="col" style={{ gap: 12 }}>
        {loading && <RoundedLoaderList count={1} rows={3} blocks={36} />}
        {!loading && !error && records.length > 0 && (
          <div className="col" style={{ gap: 10 }}>
            {records.slice((page - 1) * pageSize, page * pageSize).map((item) => {
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
              const isFreeTransfer =
                item.paymentType === 'free' ||
                item.paymentAsset === 'FREE' ||
                (!item.txHash.startsWith('0x') && item.tierId === 0);
              const hasPlainNote = typeof item.note === 'string' && item.note.length > 0;
              const hasEncryptedNote =
                !hasPlainNote &&
                Boolean(item.encryption?.noteCiphertext && item.encryption?.noteIv);
              const expiresAt = nextUtcMidnight(item.sentAt + FILE_EXPIRATION_MS);
              return (
                <div key={item.id} className="transferItem">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }} className="mono">
                      {item.filename}
                    </div>
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {formatBytes(item.filesize)} · sent {formatDate(item.sentAt)} · expires{' '}
                      {formatDate(expiresAt)}
                    </div>
                    {expanded[item.id] && (
                      <div className="details mono" style={{ fontSize: 12 }}>
                        <div>
                          to: <AddressLink address={item.recipient} size={5} />
                        </div>
                        <div>
                          from: <AddressLink address={item.initiator} size={5} />
                        </div>
                        <div>
                          tx:{' '}
                          {isFreeTransfer ? (
                            <span className="muted">Free micro-send</span>
                          ) : (
                            <TxLink tx={item.txHash} size={5} />
                          )}
                        </div>
                        <div>tier: {tier ? tier.label : `Tier ${item.tierId}`}</div>
                        <div>
                          burned:{' '}
                          {isFreeTransfer ? (
                            '0 R1 (free credit)'
                          ) : (
                            <>
                              {r1Display ?? '-'} R1 {usdDisplay ? `(≈ ${usdDisplay} $)` : ''}
                            </>
                          )}
                        </div>
                        <div>
                          note: {hasPlainNote ? item.note : hasEncryptedNote ? '(encrypted)' : '-'}
                        </div>
                        <div>sent at: {formatDateShort(item.sentAt)}</div>
                        <div>expires: {formatDateShort(expiresAt)}</div>
                      </div>
                    )}
                  </div>
                  <div className="col transferActions" style={{ alignItems: 'flex-end', gap: 8 }}>
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
              );
            })}
            {/* Pagination controls */}
            <div className="pagination">
              {(() => {
                const total = Math.max(1, Math.ceil(records.length / pageSize));
                const nums = Array.from({ length: total }, (_, i) => i + 1);
                return (
                  <>
                    <button
                      className="pageBtn pageArrow"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      aria-label="Previous page"
                      title="Previous page"
                    >
                      ‹
                    </button>
                    {nums.map((n) => (
                      <button
                        key={n}
                        className={`pageBtn${page === n ? ' active' : ''}`}
                        onClick={() => setPage(n)}
                        aria-current={page === n ? 'page' : undefined}
                        title={`Page ${n}`}
                      >
                        {n}
                      </button>
                    ))}
                    <button
                      className="pageBtn pageArrow"
                      onClick={() => setPage((p) => Math.min(total, p + 1))}
                      disabled={page >= total}
                      aria-label="Next page"
                      title="Next page"
                    >
                      ›
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </section>
      {!loading && !error && records.length === 0 && (
        <section className="card col" style={{ gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Your outbox is empty</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Send a file to see it listed here.
          </div>
        </section>
      )}
    </main>
  );
}

'use client';

import { AddressLink, NodeLinks, TxLink } from '@/components/Links';
import { daysLeft, formatBytes, formatDate, formatDateShort, formatExpiry } from '@/lib/format';
import { seedMockForAddress } from '@/lib/mock';
import { decryptPacketToBlob } from '@/lib/ratio1';
import { getPacket, InboxItem, listInbox, markInboxDownloaded, subscribe } from '@/lib/store';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function InboxPage() {
  const { address, isConnected } = useAccount();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!address) return;
    const load = () => setItems(listInbox(address));
    load();
    if (listInbox(address).length === 0) {
      seedMockForAddress(address)
        .then(load)
        .catch(() => {});
    }
    return subscribe(load);
  }, [address]);

  // Auto-expand mock items
  useEffect(() => {
    if (items.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (it.isMock && next[it.id] === undefined) next[it.id] = true;
      }
      return next;
    });
  }, [items]);

  async function onDownload(item: InboxItem) {
    try {
      setDownloadingId(item.id);
      const packet = getPacket(item.packetId);
      if (!packet) {
        // Fallback: download placeholder to demo flow
        const placeholder = new Blob([`Mock download for ${item.name}`], {
          type: 'text/plain',
        });
        await downloadBlob(placeholder, `${item.name}.txt`);
        return;
      }
      const blob = await decryptPacketToBlob(packet);
      await downloadBlob(blob, packet.filename);
      if (address) markInboxDownloaded(address, item.id);
    } catch (e) {
      console.error(e);
      alert('Failed to download (mock).');
    } finally {
      setDownloadingId(null);
    }
  }

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

  return (
    <main className="col" style={{ gap: 24 }}>
      <div className="hero">
        <div className="headline">Inbox</div>
        <div className="subhead">Files sent to your wallet.</div>
      </div>

      <section className="col" style={{ gap: 12 }}>
        {items.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            No files in your inbox yet.
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {items.map((t) => (
              <div key={t.id} className="transferItem">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }} className="mono">
                    {t.name}
                  </div>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {' '}
                    {formatBytes(t.size)} · received {formatDate(t.createdAt)} · expires{' '}
                    {formatExpiry(t.expiresAt)}
                  </div>
                  {!t.isMock && t.viaNodes && t.viaNodes.length > 0 && (
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      via <NodeLinks aliases={t.viaNodes} />
                    </div>
                  )}
                  {expanded[t.id] && (
                    <div className="details mono" style={{ fontSize: 12 }}>
                      {t.isMock ? (
                        <>
                          <div>
                            from: <AddressLink address={t.details?.peer || t.from} size={5} />
                          </div>
                          <div>
                            tx: <TxLink tx={t.details?.tx || ''} size={5} />
                          </div>
                          <div>
                            via:{' '}
                            <NodeLinks aliases={t.details?.via || ['draco', 'lyra', 'aether']} />
                          </div>
                          <div>encrypted message: {t.details?.encMsg || 'message'} (0 bytes)</div>
                          <div>received: {formatDateShort(t.details?.received || t.createdAt)}</div>
                          <div>
                            expiring: {formatDateShort(t.details?.expiring || t.expiresAt)} (
                            {daysLeft(t.details?.expiring || t.expiresAt)})
                          </div>
                        </>
                      ) : (
                        (() => {
                          const p = getPacket(t.packetId);
                          const cipherPreview = p?.ciphertext?.slice(0, 24) || '';
                          const clen = p?.ciphertext
                            ? typeof atob !== 'undefined'
                              ? atob(p.ciphertext).length
                              : p.ciphertext.length
                            : 0;
                          return (
                            <>
                              <div>
                                from: <AddressLink address={t.from} size={5} />
                              </div>
                              <div>
                                tx: {p?.sendTxHash ? <TxLink tx={p.sendTxHash} size={5} /> : '—'}
                              </div>
                              <div>
                                via:{' '}
                                <NodeLinks
                                  aliases={
                                    t.viaNodes && t.viaNodes.length ? t.viaNodes : p?.viaNodes || []
                                  }
                                />
                              </div>
                              <div>
                                encrypted message: {cipherPreview}… ({clen} bytes)
                              </div>
                              <div>received: {formatDateShort(t.createdAt)}</div>
                              <div>
                                expiring: {formatDateShort(t.expiresAt)} ({daysLeft(t.expiresAt)})
                              </div>
                            </>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
                <div className="col" style={{ gap: 8, alignItems: 'flex-end' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      className="button"
                      onClick={() => onDownload(t)}
                      disabled={t.status !== 'available' || downloadingId === t.id}
                    >
                      {downloadingId === t.id ? 'Downloading…' : 'Download'}
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))}
                    >
                      {expanded[t.id] ? 'Hide Details' : 'Details'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

'use client';

import { AddressLink, TxLink } from '@/components/Links';
import { getTierById } from '@/lib/constants';
import { decodeBase64, decryptFileFromEnvelope } from '@/lib/encryption';
import { formatBytes, formatDate, formatDateShort } from '@/lib/format';
import { derivePasskeyX25519KeyPair } from '@/lib/passkeyClient';
import type { PasskeyRecord, StoredUploadRecord } from '@/lib/types';
import { getVaultPrivateKey } from '@/lib/vaultClient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useSignMessage } from 'wagmi';

type ReceivedItem = StoredUploadRecord & { id: string };

const makeRecordId = (record: StoredUploadRecord) => `${record.txHash}:${record.initiator}`;

export default function InboxPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [records, setRecords] = useState<ReceivedItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [passkeyRecord, setPasskeyRecord] = useState<PasskeyRecord | null>(null);
  console.log({ passkeyRecord });
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const passkeyKeyCacheRef = useRef<Uint8Array | null>(null);

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

  const fetchPasskeyStatus = useCallback(async () => {
    passkeyKeyCacheRef.current = null;
    if (!address) {
      setPasskeyRecord(null);
      setPasskeyLoading(false);
      setPasskeyError(null);
      return;
    }
    setPasskeyLoading(true);
    setPasskeyError(null);
    try {
      const params = new URLSearchParams({ address });
      const res = await fetch(`/api/passkeys/status?${params.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to fetch passkey status');
      }
      setPasskeyRecord(payload.record ?? null);
      console.log('Fetched passkey record:', payload.record);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setPasskeyRecord(null);
      setPasskeyError(message);
    } finally {
      setPasskeyLoading(false);
    }
  }, [address]);

  useEffect(() => {
    let active = true;
    fetchPasskeyStatus().catch(() => {
      if (active) {
        setPasskeyError((prev) => prev ?? 'Failed to fetch passkey status');
      }
    });
    return () => {
      active = false;
    };
  }, [fetchPasskeyStatus]);

  useEffect(() => {
    const handler = () => {
      fetchPasskeyStatus().catch(() => {
        setPasskeyError((prev) => prev ?? 'Failed to refresh passkey status');
      });
    };
    window.addEventListener('ratio1:passkey-updated', handler);
    return () => {
      window.removeEventListener('ratio1:passkey-updated', handler);
    };
  }, [fetchPasskeyStatus]);

  const onDownload = useCallback(
    async (item: ReceivedItem) => {
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
        const fileName =
          (payload.file.filename && typeof payload.file.filename === 'string'
            ? payload.file.filename
            : null) ??
          item.originalFilename ??
          item.filename;

        const { encryption, originalMimeType } = item;
        if (encryption) {
          if (!address) {
            throw new Error('Wallet address required to decrypt');
          }

          let base64Data: string | null = null;
          if (typeof rawBase64 === 'string') {
            if (rawBase64.startsWith('data:')) {
              const commaIndex = rawBase64.indexOf(',');
              base64Data = commaIndex >= 0 ? rawBase64.slice(commaIndex + 1) : null;
            } else {
              base64Data = rawBase64;
            }
          }
          if (!base64Data) {
            throw new Error('Encrypted payload missing data');
          }

          const ciphertext = decodeBase64(base64Data);
          let privateKey: Uint8Array;
          const keySource = encryption.keySource === 'passkey' ? 'passkey' : 'vault';

          if (keySource === 'passkey') {
            if (passkeyLoading) {
              throw new Error('Passkey status is still loading. Please try again momentarily.');
            }
            if (!passkeyRecord) {
              throw new Error('No passkey registered. Visit your profile to register a passkey.');
            }
            if (!passkeyRecord.prfSalt || !passkeyRecord.credentialId) {
              throw new Error('Passkey record is incomplete. Please re-register your passkey.');
            }
            let cached = passkeyKeyCacheRef.current;
            if (!cached) {
              const saltBytes = decodeBase64(passkeyRecord.prfSalt);
              const { privateKey: derivedPrivateKey, publicKey: derivedPublicKey } =
                await derivePasskeyX25519KeyPair({
                  credentialIdB64: passkeyRecord.credentialId,
                  salt: saltBytes,
                });
              if (passkeyRecord.publicKey && derivedPublicKey !== passkeyRecord.publicKey) {
                throw new Error('Passkey verification failed. Public key mismatch.');
              }
              cached = new Uint8Array(derivedPrivateKey);
              passkeyKeyCacheRef.current = cached;
            }
            privateKey = cached;
          } else {
            if (!signMessageAsync) {
              throw new Error('Wallet signer not available');
            }
            privateKey = await getVaultPrivateKey(address, signMessageAsync);
          }

          const plaintext = await decryptFileFromEnvelope({
            ciphertext,
            metadata: encryption,
            recipientPrivateKey: privateKey,
          });

          const mimeType =
            typeof originalMimeType === 'string' && originalMimeType.trim().length > 0
              ? originalMimeType
              : 'application/octet-stream';
          const plainBuffer = plaintext.buffer.slice(
            plaintext.byteOffset,
            plaintext.byteOffset + plaintext.byteLength
          ) as ArrayBuffer;
          const blob = new Blob([plainBuffer], { type: mimeType });
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(downloadUrl);
        } else {
          const downloadUrl =
            typeof rawBase64 === 'string' && rawBase64.startsWith('data:')
              ? rawBase64
              : `data:application/octet-stream;base64,${rawBase64 ?? ''}`;
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        alert(message);
      } finally {
        setDownloadingId((current) => (current === item.id ? null : current));
      }
    },
    [address, signMessageAsync, passkeyRecord]
  );

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

  const missingKeys = hasKey === false && !passkeyRecord;
  if (missingKeys && !passkeyLoading) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Inbox</div>
          <div className="subhead">Set up your encryption keys to receive and decrypt files.</div>
        </div>
        <div
          className="card"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Encryption required</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Generate a vault key pair or register a passkey so files can be delivered and
              decrypted.
            </div>
          </div>
          <a href="/profile" className="button" style={{ textDecoration: 'none' }}>
            Go to Profile
          </a>
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

      {passkeyError && <div style={{ color: '#f87171', fontSize: 12 }}>{passkeyError}</div>}

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

'use client';

import { AddressLink, TxLink } from '@/components/Links';
import { FILE_EXPIRATION_MS, getTierById } from '@/lib/constants';
import { decodeBase64, decryptFileFromEnvelope, decryptNoteFromEnvelope } from '@/lib/encryption';
import { formatBytes, formatDate, formatDateShort } from '@/lib/format';
import { deriveSeedKeyPair } from '@/lib/keys';
import { derivePasskeyX25519KeyPair } from '@/lib/passkeyClient';
import type { RegisteredKeyRecord, RegisteredPasskeyRecord, StoredUploadRecord } from '@/lib/types';
import { getVaultPrivateKey } from '@/lib/vaultClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { formatUnits } from 'viem';
import { useAccount, useSignMessage } from 'wagmi';
import { loadProfile } from '../profile/storage';
import { RoundedLoaderList } from '@/components/RoundedLoader';

type ReceivedItem = StoredUploadRecord & { id: string };
type NoteState = {
  status: 'idle' | 'decrypting' | 'success' | 'error';
  value?: string;
  error?: string;
};

const makeRecordId = (record: StoredUploadRecord) => `${record.txHash}:${record.initiator}`;

export default function InboxPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [records, setRecords] = useState<ReceivedItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [registeredKeyRecord, setRegisteredKeyRecord] = useState<RegisteredKeyRecord | null>(null);
  const [registeredKeyLoading, setRegisteredKeyLoading] = useState(false);
  const [registeredKeyError, setRegisteredKeyError] = useState<string | null>(null);
  const [noteStates, setNoteStates] = useState<Record<string, NoteState>>({});
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const passkeyRecord = useMemo<RegisteredPasskeyRecord | null>(() => {
    return registeredKeyRecord?.type === 'passkey' ? registeredKeyRecord : null;
  }, [registeredKeyRecord]);
  const seedKeyCacheRef = useRef<{ privateKey: Uint8Array; publicKey: string } | null>(null);
  const passkeyLoading = registeredKeyLoading;

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
      const friendly =
        message === 'Unknown error' ? 'Unable to load your inbox. Please try again.' : message;
      toast.error(friendly, { toastId: 'inbox-load-error' });
      setError(friendly);
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
    setNoteStates((prev) => {
      const next: Record<string, NoteState> = {};
      for (const record of records) {
        next[record.id] = prev[record.id] ?? { status: 'idle' };
      }
      return next;
    });
    // Reset to first page when records change
    setPage(1);
  }, [records]);

  const fetchPasskeyStatus = useCallback(async () => {
    seedKeyCacheRef.current = null;
    if (!address) {
      setRegisteredKeyRecord(null);
      setRegisteredKeyLoading(false);
      setRegisteredKeyError(null);
      return;
    }
    setRegisteredKeyLoading(true);
    setRegisteredKeyError(null);
    try {
      const params = new URLSearchParams({ address });
      const res = await fetch(`/api/keys/status?${params.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to fetch key status');
      }
      setRegisteredKeyRecord(payload.record ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const friendly =
        message === 'Unknown error'
          ? 'Unable to check your encryption settings. Please try again.'
          : message;
      setRegisteredKeyRecord(null);
      toast.error(friendly, { toastId: 'inbox-key-error' });
      setRegisteredKeyError(friendly);
    } finally {
      setRegisteredKeyLoading(false);
    }
  }, [address]);

  useEffect(() => {
    let active = true;
    fetchPasskeyStatus().catch(() => {
      if (active) {
        setRegisteredKeyError((prev) => {
          if (prev) {
            return prev;
          }
          const friendly = 'Unable to refresh your encryption status.';
          toast.error(friendly, { toastId: 'inbox-key-error' });
          return friendly;
        });
      }
    });
    return () => {
      active = false;
    };
  }, [fetchPasskeyStatus]);

  useEffect(() => {
    const handler = () => {
      fetchPasskeyStatus().catch(() => {
        setRegisteredKeyError((prev) => {
          if (prev) {
            return prev;
          }
          const friendly = 'Unable to refresh your encryption status.';
          toast.error(friendly, { toastId: 'inbox-key-error' });
          return friendly;
        });
      });
    };
    window.addEventListener('ratio1:registered-key-updated', handler);
    return () => {
      window.removeEventListener('ratio1:registered-key-updated', handler);
    };
  }, [fetchPasskeyStatus]);

  useEffect(() => {
    seedKeyCacheRef.current = null;
  }, [address]);

  const resolveRecipientPrivateKey = useCallback(
    async (
      item: ReceivedItem
    ): Promise<{ privateKey: Uint8Array; source: 'passkey' | 'seed' | 'vault' }> => {
      const { encryption } = item;
      if (!encryption) {
        throw new Error('No encryption metadata for this transfer.');
      }
      if (!address) {
        throw new Error('Wallet address required to decrypt');
      }

      const keySource =
        encryption.keySource === 'passkey'
          ? 'passkey'
          : encryption.keySource === 'seed'
            ? 'seed'
            : 'vault';

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
        const saltBytes = decodeBase64(passkeyRecord.prfSalt);
        const { privateKey: derivedPrivateKey, publicKey: derivedPublicKey } =
          await derivePasskeyX25519KeyPair({
            credentialIdB64: passkeyRecord.credentialId,
            salt: saltBytes,
          });
        if (passkeyRecord.publicKey && derivedPublicKey !== passkeyRecord.publicKey) {
          derivedPrivateKey.fill(0);
          throw new Error(
            'This transfer was encrypted with your previous passkey. Files sent before you rotated passkeys require that passkey to decrypt.'
          );
        }
        const privateKey = new Uint8Array(derivedPrivateKey);
        derivedPrivateKey.fill(0);
        return { privateKey, source: 'passkey' };
      }

      if (keySource === 'seed') {
        if (registeredKeyLoading) {
          throw new Error('Key status is still loading. Please try again momentarily.');
        }
        if (!registeredKeyRecord || registeredKeyRecord.type !== 'seed') {
          throw new Error(
            'No seed key registered. Visit your profile to register a recovery phrase.'
          );
        }
        let cached = seedKeyCacheRef.current;
        if (!cached) {
          let mnemonic: string | null = null;
          try {
            const profile = loadProfile(address);
            const stored =
              typeof profile.seedMnemonic === 'string' ? profile.seedMnemonic.trim() : '';
            mnemonic = stored.length > 0 ? stored : null;
          } catch {
            mnemonic = null;
          }
          if (!mnemonic) {
            throw new Error(
              'Recovery phrase not found on this device. Restore it from your backup in Profile.'
            );
          }
          const { privateKey: derivedPrivateKey, publicKeyBase64 } =
            await deriveSeedKeyPair(mnemonic);
          if (publicKeyBase64 !== registeredKeyRecord.publicKey) {
            throw new Error(
              'Stored recovery phrase does not match the registered seed key. Re-register your seed.'
            );
          }
          cached = {
            privateKey: new Uint8Array(derivedPrivateKey),
            publicKey: publicKeyBase64,
          };
          seedKeyCacheRef.current = cached;
        }
        if (
          typeof encryption.recipientPublicKey === 'string' &&
          encryption.recipientPublicKey.trim().length > 0 &&
          encryption.recipientPublicKey !== cached.publicKey
        ) {
          throw new Error(
            'This transfer was encrypted with your previous recovery phrase. Files sent before you rotated keys require that seed to decrypt.'
          );
        }
        return { privateKey: cached.privateKey, source: 'seed' };
      }

      if (!signMessageAsync) {
        throw new Error('Wallet signer not available');
      }
      const privateKey = await getVaultPrivateKey(address, signMessageAsync);
      return { privateKey, source: 'vault' };
    },
    [
      address,
      passkeyLoading,
      passkeyRecord,
      registeredKeyLoading,
      registeredKeyRecord,
      signMessageAsync,
    ]
  );

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
          const { privateKey, source } = await resolveRecipientPrivateKey(item);
          try {
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
          } finally {
            if (source === 'passkey') {
              privateKey.fill(0);
            }
          }
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
        const displayNameRaw = fileName ?? 'your file';
        const displayName =
          displayNameRaw.length > 60
            ? `${displayNameRaw.slice(0, 40)}…${displayNameRaw.slice(-15)}`
            : displayNameRaw;
        toast.success(`Download started for ${displayName}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const friendly =
          message === 'Unknown error' ? 'Download failed. Please try again.' : message;
        toast.error(friendly);
      } finally {
        setDownloadingId((current) => (current === item.id ? null : current));
      }
    },
    [resolveRecipientPrivateKey]
  );

  const onDecryptNote = useCallback(
    async (item: ReceivedItem) => {
      if (!item.encryption || !item.encryption.noteCiphertext || !item.encryption.noteIv) {
        setNoteStates((prev) => ({
          ...prev,
          [item.id]: { status: 'error', error: 'No encrypted note found.' },
        }));
        toast.error('This transfer does not include an encrypted note.');
        return;
      }
      setNoteStates((prev) => {
        const previous = prev[item.id];
        return {
          ...prev,
          [item.id]: { status: 'decrypting', value: previous?.value },
        };
      });
      try {
        const { privateKey, source } = await resolveRecipientPrivateKey(item);
        try {
          const noteText = await decryptNoteFromEnvelope({
            metadata: item.encryption,
            recipientPrivateKey: privateKey,
          });
          setNoteStates((prev) => ({
            ...prev,
            [item.id]: { status: 'success', value: noteText },
          }));
          toast.success('Note decrypted.');
        } finally {
          if (source === 'passkey') {
            privateKey.fill(0);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        const friendly =
          message === 'Unknown error' ? 'Unable to decrypt this note. Please try again.' : message;
        setNoteStates((prev) => {
          const previous = prev[item.id];
          return {
            ...prev,
            [item.id]: { status: 'error', error: friendly, value: previous?.value },
          };
        });
        toast.error(friendly);
      }
    },
    [resolveRecipientPrivateKey]
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

  return (
    <main className="col" style={{ gap: 24 }}>
      <div className="hero">
        <div className="headline">Inbox</div>
        <div className="subhead">Files sent to your wallet.</div>
      </div>
      <section className="col" style={{ gap: 12 }}>
        {loading && <RoundedLoaderList count={5} />}
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
              const noteState = noteStates[item.id];
              const hasPlainNote = typeof item.note === 'string' && item.note.length > 0;
              const hasEncryptedNote =
                !hasPlainNote &&
                Boolean(item.encryption?.noteCiphertext && item.encryption?.noteIv);
              const encryption = item.encryption;
              const keySource = encryption?.keySource;
              const recipientPublicKey =
                typeof encryption?.recipientPublicKey === 'string' &&
                encryption.recipientPublicKey.trim().length > 0
                  ? encryption.recipientPublicKey
                  : null;
              let keyRotationWarning: string | null = null;
              let keyRotationLocked = false;
              if (
                !registeredKeyLoading &&
                encryption &&
                (keySource === 'passkey' || keySource === 'seed')
              ) {
                const record = registeredKeyRecord;
                const keyMismatch =
                  !record ||
                  record.type !== keySource ||
                  (recipientPublicKey && record.publicKey !== recipientPublicKey);
                if (keyMismatch) {
                  keyRotationLocked = true;
                  keyRotationWarning =
                    keySource === 'passkey'
                      ? 'Encrypted with your previous passkey. Files sent before you rotated passkeys cannot be decrypted with this credential.'
                      : 'Encrypted with your previous recovery phrase. Files sent before you rotated keys cannot be decrypted with the seed stored on this device.';
                }
              }
              const downloadDisabled = downloadingId === item.id || keyRotationLocked;
              const decryptNoteDisabled = noteState?.status === 'decrypting' || keyRotationLocked;
              const rotationDisabledStyles = keyRotationLocked
                ? { opacity: 0.55, cursor: 'not-allowed' as const }
                : null;
              const expiresAt = item.expiresAt ?? item.sentAt + FILE_EXPIRATION_MS;
              return (
                <div key={item.id} className="transferItem">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }} className="mono">
                      {item.filename}
                    </div>
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      {formatBytes(item.filesize)} · received {formatDate(item.sentAt)} · expires{' '}
                      {formatDate(expiresAt)}
                    </div>
                    {keyRotationWarning && (
                      <div
                        style={{
                          color: '#fb923c',
                          fontSize: 12,
                          marginTop: 6,
                          lineHeight: 1.4,
                          maxWidth: 320,
                        }}
                      >
                        {keyRotationWarning}
                      </div>
                    )}
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
                          burned: {r1Display ?? '-'} R1 {usdDisplay ? `(≈ ${usdDisplay} $)` : ''}
                        </div>
                        <div>
                          note:{' '}
                          {hasPlainNote ? (
                            item.note
                          ) : hasEncryptedNote ? (
                            noteState?.status === 'success' ? (
                              noteState.value && noteState.value.length > 0 ? (
                                noteState.value
                              ) : (
                                '-'
                              )
                            ) : (
                              <>
                                <span>(encrypted)</span>
                                <button
                                  type="button"
                                  className="button secondary"
                                  style={{
                                    marginLeft: 8,
                                    padding: '2px 8px',
                                    fontSize: 11,
                                    ...(rotationDisabledStyles ?? {}),
                                  }}
                                  onClick={() => onDecryptNote(item)}
                                  disabled={decryptNoteDisabled}
                                  title={
                                    keyRotationLocked
                                      ? (keyRotationWarning ?? undefined)
                                      : undefined
                                  }
                                >
                                  {noteState?.status === 'decrypting'
                                    ? 'Decrypting…'
                                    : 'Decrypt note'}
                                </button>
                              </>
                            )
                          ) : (
                            '-'
                          )}
                        </div>
                        <div>received: {formatDateShort(item.sentAt)}</div>
                        <div>expires: {formatDateShort(expiresAt)}</div>
                      </div>
                    )}
                  </div>
                  <div className="col" style={{ gap: 8, alignItems: 'flex-end' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        className="button"
                        onClick={() => onDownload(item)}
                        disabled={downloadDisabled}
                        style={rotationDisabledStyles ?? undefined}
                        title={keyRotationLocked ? (keyRotationWarning ?? undefined) : undefined}
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
          <div style={{ fontWeight: 700 }}>Your inbox is empty</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Files sent to you will appear here.
          </div>
        </section>
      )}
    </main>
  );
}

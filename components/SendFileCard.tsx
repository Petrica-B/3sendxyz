'use client';

import { useMemo, useState } from 'react';
import { isAddress } from 'viem';
import { useAccount, useSignMessage } from 'wagmi';

export function SendFileCard() {
  const { address, isConnected } = useAccount();
  const [recipient, setRecipient] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signMessageAsync } = useSignMessage();

  const disabled = useMemo(() => {
    return !isConnected || !isAddress(recipient) || !file || sending;
  }, [isConnected, recipient, file, sending]);

  async function onSend() {
    if (!address || !file) return;
    setError(null);
    setSending(true);
    try {
      const startedAt = Date.now();
      const handshakeMsg = `ratio1/handshake\nfrom:${address}\nto:${recipient}\ntimestamp:${startedAt}`;
      const signature = await signMessageAsync({ message: handshakeMsg });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('initiator', address);
      formData.append('recipient', recipient);
      if (note) formData.append('note', note);
      formData.append('handshakeMessage', handshakeMsg);
      formData.append('signature', signature);
      formData.append('sentAt', String(startedAt));

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Upload failed');
      }

      setFile(null);
      setNote('');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ratio1:upload-completed'));
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card col" style={{ gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Send a file</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Uploads go through the ratio1 server API
        </div>
      </div>

      <label className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Recipient wallet address
        </span>
        <input
          className="input"
          placeholder="0x… or ENS (mock)"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value.trim())}
        />
        {!recipient ? null : isAddress(recipient) ? (
          <span className="muted" style={{ fontSize: 12 }}>
            Address looks valid
          </span>
        ) : (
          <span style={{ color: '#f87171', fontSize: 12 }}>Invalid address format</span>
        )}
      </label>

      <div className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Select file
        </span>
        <div className="dropzone">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ width: '100%' }}
          />
          <div className="muted mono" style={{ fontSize: 12, marginTop: 8 }}>
            Max ~50MB recommended for demo.
          </div>
          {file && (
            <div style={{ marginTop: 8 }}>
              <div>
                <strong>{file.name}</strong>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </div>
          )}
        </div>
      </div>

      <label className="col">
        <span className="muted mono" style={{ fontSize: 12 }}>
          Optional note
        </span>
        <input
          className="input"
          placeholder="Say hi to the recipient (encrypted)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {!isConnected && (
        <div className="muted" style={{ fontSize: 12 }}>
          Connect your wallet to continue.
        </div>
      )}
      {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="button" onClick={onSend} disabled={disabled}>
          {sending ? 'Uploading...' : 'Upload & Send'}
        </button>
      </div>

      {/* Outbox list moved to Outbox page */}
    </div>
  );
}

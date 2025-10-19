'use client';

import { createRatio1Session, encryptFileToPacket } from '@/lib/ratio1';
import {
  addInbox,
  addOutbox,
  deliverPacket,
  setOutboxPacket,
  updateOutboxStatus,
} from '@/lib/store';
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
    // Create an outbox entry early
    try {
      const tempId = `temp:${Date.now()}`;
      // 1) Mock handshake via signature to derive a session key
      const handshakeMsg = `ratio1/handshake\nfrom:${address}\nto:${recipient}\ntimestamp:${Date.now()}`;
      const sig = await signMessageAsync({ message: handshakeMsg });
      const session = await createRatio1Session({
        initiator: address,
        recipient,
        signature: sig,
        context: '3send.xyz:mock',
      });
      // seed outbox record
      addOutbox(address, {
        id: tempId, // temporary before packet
        to: recipient,
        name: file.name,
        size: file.size,
        status: 'encrypting',
        createdAt: Date.now(),
        packetId: 'pending',
      });

      // 2) Encrypt file into a mock packet
      const packet = await encryptFileToPacket({
        file,
        session,
        note,
        embedKeyMaterial: true,
        viaNodes: undefined,
      });

      // 3) Deliver to mock transport + update outbox/inbox stores
      deliverPacket(packet);

      // Find and update most recent outbox entry for this file
      setOutboxPacket(address, tempId, packet.id, packet.viaNodes);
      updateOutboxStatus(address, tempId, 'sent');

      // Inbox item for the recipient (mock)
      addInbox(recipient, {
        id: packet.id,
        from: address,
        name: file.name,
        size: file.size,
        createdAt: Date.now(),
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 2, // 2 days
        status: 'available',
        packetId: packet.id,
        viaNodes: packet.viaNodes,
      });

      setFile(null);
      setNote('');
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
          P2P mock using ratio1 stubs
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
            Max ~50MB recommended for demo. Encrypted locally in-browser.
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
          {sending ? 'Encrypting…' : 'Encrypt & Send (Mock)'}
        </button>
      </div>

      {/* Outbox list moved to Outbox page */}
    </div>
  );
}

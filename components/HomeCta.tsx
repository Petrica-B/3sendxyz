'use client';

import { shortAddress } from '@/lib/format';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';

export default function HomeCta() {
  const { isConnected, address } = useAccount();
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const sentLoading = isConnected && Boolean(address) && sentCount === null;
  const inboxLoading = isConnected && Boolean(address) && inboxCount === null;

  useEffect(() => {
    let aborted = false;
    async function fetchCounts() {
      if (!isConnected || !address) {
        setSentCount(null);
        setInboxCount(null);
        return;
      }
      try {
        const qsSent = new URLSearchParams({ initiator: address });
        const qsInbox = new URLSearchParams({ recipient: address });
        const [resSent, resInbox] = await Promise.all([
          fetch(`/api/sent?${qsSent.toString()}`),
          fetch(`/api/inbox?${qsInbox.toString()}`),
        ]);
        const [payloadSent, payloadInbox] = await Promise.all([
          resSent.json().catch(() => null),
          resInbox.json().catch(() => null),
        ]);
        if (!aborted) {
          const s =
            resSent.ok && payloadSent?.success && Array.isArray(payloadSent.records)
              ? payloadSent.records.length
              : 0;
          const i =
            resInbox.ok && payloadInbox?.success && Array.isArray(payloadInbox.records)
              ? payloadInbox.records.length
              : 0;
          setSentCount(s);
          setInboxCount(i);
        }
      } catch {
        if (!aborted) {
          setSentCount(0);
          setInboxCount(0);
        }
      }
    }
    fetchCounts();
    const onCompleted = () => fetchCounts();
    const onFocus = () => fetchCounts();
    window.addEventListener('ratio1:upload-completed', onCompleted);
    window.addEventListener('focus', onFocus);
    return () => {
      aborted = true;
      window.removeEventListener('ratio1:upload-completed', onCompleted);
      window.removeEventListener('focus', onFocus);
    };
  }, [isConnected, address]);

  if (isConnected) {
    return (
      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>
            Hello
            {address ? (
              <>
                , <span style={{ color: 'var(--accent)' }}>{shortAddress(address, 5)}</span>
              </>
            ) : null}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Check your files
          </div>
        </div>
        <div className="homeCtaActions">
          <Link
            href="/outbox"
            className="button"
            style={{ textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <span>Open Outbox</span>
            <span className="pill" aria-label="outbox-active-count" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24 }}>
              {sentLoading ? <span className="spinner" aria-hidden /> : typeof sentCount === 'number' ? sentCount : '—'}
            </span>
          </Link>
          <Link
            href="/inbox"
            className="button"
            style={{ textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <span>Open Inbox</span>
            <span className="pill" aria-label="inbox-active-count" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24 }}>
              {inboxLoading ? <span className="spinner" aria-hidden /> : typeof inboxCount === 'number' ? inboxCount : '—'}
            </span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Connect now to get started</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Check your inbox and send files with full privacy.
            </div>
          </div>
          <div className="homeCtaActions">
            <button type="button" className="button" onClick={openConnectModal}>
              Connect Wallet
            </button>
          </div>
        </div>
      )}
    </ConnectButton.Custom>
  );
}

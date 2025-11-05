'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function WelcomeModal() {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      if (typeof window === 'undefined') return false;
      return !localStorage.getItem('3send.welcome.seen');
    } catch {
      return true;
    }
  });

  // Mark as seen immediately when we show it the first time
  useEffect(() => {
    if (open) {
      try {
        localStorage.setItem('3send.welcome.seen', '1');
      } catch {
        // ignore
      }
    }
  }, [open]);

  const dismiss = () => {
    try {
      localStorage.setItem('3send.welcome.seen', '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(17, 24, 39, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 50,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss();
      }}
    >
      <div
        className="card col"
        style={{
          gap: 14,
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
          position: 'relative',
        }}
      >
        <button
          className="button secondary"
          aria-label="Close"
          title="Close"
          onClick={dismiss}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: 6,
            minWidth: 32,
            minHeight: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div id="welcome-modal-title" style={{ fontWeight: 800, fontSize: 18 }}>
          Welcome to <span style={{ color: 'var(--accent)' }}>3send</span>
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          Say goodbye to file-sharing privacy concerns. Send encrypted files wallet-to-wallet on
          Base via Ratio1. You keep the keys and control your data.
        </div>

        <div className="welcomeSteps" aria-label="How it works">
          {/* Step: Connect */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              1
            </span>
            <Image className="welcomeStepIcon" src="/Connect.svg" alt="" width={64} height={64} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Connect your wallet</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Open 3send and connect any crypto wallet.
            </div>
          </div>
          {/* Step: Lock (encrypt) */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              2
            </span>
            <Image className="welcomeStepIcon" src="/Upload.svg" alt="" width={64} height={64} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              Upload file & enter recipient wallet
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Choose the file you want to send and paste the recipient’s wallet address.
            </div>
          </div>
          {/* Step: Upload */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              3
            </span>
            <Image className="welcomeStepIcon" src="/Lock.svg" alt="" width={64} height={64} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Pay to encrypt & send</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Confirm the burn fee with your wallet. 3send encrypts your file client-side and
              delivers it to the recipient’s decentralized inbox.
            </div>
          </div>
          {/* Step: Unlock (recipient) */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              4
            </span>
            <Image className="welcomeStepIcon" src="/Unlock.svg" alt="" width={64} height={64} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Recipient decrypts in their inbox</div>
            <div className="muted" style={{ fontSize: 12 }}>
              The recipient connects their wallet, unlocks their keys, and decrypts the file locally
              - fully private, end-to-end encrypted.
            </div>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <Link
            href="/docs"
            className="button secondary"
            onClick={dismiss}
            aria-label="Read more"
            title="Read more"
          >
            Read more
          </Link>
          <Link
            href="/send"
            className="button accent"
            onClick={dismiss}
            aria-label="Send"
            title="Send"
          >
            Send
          </Link>
        </div>
      </div>
    </div>
  );
}

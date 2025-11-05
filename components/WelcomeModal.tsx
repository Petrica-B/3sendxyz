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
        padding: 12,
        zIndex: 50,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismiss();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        className="card col"
        style={{
          gap: 10,
          maxWidth: 520,
          width: '100%',
          boxShadow: '0 10px 40px rgba(15, 23, 42, 0.25)',
          position: 'relative',
          // No internal scrolling; keep layout compact instead
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

        <div id="welcome-modal-title" style={{ fontWeight: 700, fontSize: 18 }}>
          Welcome to <span style={{ color: 'var(--accent)' }}>3send</span>
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          Say goodbye to file-sharing privacy concerns. Send encrypted files wallet-to-wallet on
          Base via Ratio1. You keep the keys and control your data.
        </div>

        <div className="welcomeSteps" aria-label="How it works">
          {/* Step 1 */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              1
            </span>
            <Image className="welcomeStepIcon" src="/Connect.svg" alt="" width={40} height={40} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Connect your wallet.</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Start instantly — no accounts or setup required.
            </div>
          </div>
          {/* Step 2 */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              2
            </span>
            <Image className="welcomeStepIcon" src="/Upload.svg" alt="" width={40} height={40} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Select files and a recipient address.</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Choose what to send and who receives it.
            </div>
          </div>
          {/* Step 3 */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              3
            </span>
            <Image className="welcomeStepIcon" src="/Lock.svg" alt="" width={40} height={40} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Encrypt locally and send decentralized.</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Your files are sealed on your device and delivered via the Ratio1 network.
            </div>
          </div>
          {/* Step 4 */}
          <div className="welcomeStepCard">
            <span className="welcomeStepNum" aria-hidden>
              4
            </span>
            <Image className="welcomeStepIcon" src="/Unlock.svg" alt="" width={40} height={40} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>Recipient decrypts in their inbox.</div>
            <div className="muted" style={{ fontSize: 12 }}>
              The recipient unlocks the file privately with their wallet.
            </div>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
          <Link
            href="/docs"
            className="button secondary"
            onClick={dismiss}
            aria-label="Read more"
            title="Read more"
          >
            Read more
          </Link>
        </div>
      </div>
    </div>
  );
}

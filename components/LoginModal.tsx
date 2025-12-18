'use client';

import { SignInButton, SignedIn, UserButton } from '@clerk/nextjs';
import { useAuthStatus } from '@/lib/useAuthStatus';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useEffect } from 'react';

type LoginModalProps = {
  open: boolean;
  onClose: () => void;
};

export function LoginModal({ open, onClose }: LoginModalProps) {
  const { isLoggedIn } = useAuthStatus();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open && isLoggedIn) {
      onClose();
    }
  }, [open, isLoggedIn, onClose]);

  if (!open) return null;

  return (
    <div
      className="authModalOverlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="authModal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        <button
          className="button secondary authModalClose"
          type="button"
          aria-label="Close login modal"
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        <div className="authModalHeader" id="login-modal-title">
          Log in to 3send
        </div>
        <div className="authModalSubhead">
          Start with email and password (recommended) or use a wallet if you already have one.
        </div>

        <SignedIn>
          <div className="authSignedIn">
            <span className="muted" style={{ fontSize: 12 }}>
              Signed in
            </span>
            <UserButton />
          </div>
        </SignedIn>

        <div className="authModalOptions">
          <SignInButton mode="modal">
            <button className="authOption authOptionPrimary" type="button">
              <span className="authOptionIcon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                    stroke="#111827"
                    strokeWidth="1.5"
                  />
                  <path d="m3 7 9 6 9-6" stroke="#111827" strokeWidth="1.5" />
                </svg>
              </span>
              <span className="authOptionCopy">
                <span className="authOptionTitle">Email &amp; password</span>
                <span className="authOptionDesc">
                  No wallet required. Fastest way to get started.
                </span>
              </span>
              <span className="authOptionBadge">Recommended</span>
            </button>
          </SignInButton>

          <ConnectButton.Custom>
            {({ openConnectModal, mounted }) => (
              <button
                className="authOption"
                type="button"
                onClick={() => {
                  if (!mounted) return;
                  onClose();
                  openConnectModal();
                }}
                disabled={!mounted}
              >
                <span className="authOptionIcon" aria-hidden>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 8h10.5a2.5 2.5 0 0 1 0 5H8a2 2 0 0 0 0 4h10"
                      stroke="#111827"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M16.5 10.5h3a1.5 1.5 0 0 1 0 3h-3"
                      stroke="#111827"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span className="authOptionCopy">
                  <span className="authOptionTitle">Wallet</span>
                  <span className="authOptionDesc">
                    Connect an existing wallet to send encrypted files.
                  </span>
                </span>
                <span className="authOptionHint">Web3</span>
              </button>
            )}
          </ConnectButton.Custom>
        </div>

        <div className="authModalFooter">
          You can add a wallet later. We will never ask for your seed phrase.
        </div>
      </div>
    </div>
  );
}

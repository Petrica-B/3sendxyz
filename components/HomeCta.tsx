'use client';

import { IdentityBadge } from '@/components/IdentityBadge';
import { FREE_MICRO_SENDS_PER_MONTH } from '@/lib/constants';
import { shortAddress } from '@/lib/format';
import { fetchIdentityProfile, identityQueryKey } from '@/lib/identity';
import { useQuery } from '@tanstack/react-query';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { useAccount } from 'wagmi';

export default function HomeCta() {
  const { isConnected, address } = useAccount();
  const normalizedAddress = address?.trim().toLowerCase() ?? '';
  const { data: identityProfile } = useQuery({
    queryKey: identityQueryKey(normalizedAddress),
    queryFn: () => fetchIdentityProfile(normalizedAddress),
    enabled: Boolean(normalizedAddress),
    staleTime: 30 * 60 * 1000,
  });
  const hasBaseName = Boolean(identityProfile?.name?.trim());
  const shortAddr = address ? shortAddress(address, 4) : '';
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [inboxCount, setInboxCount] = useState<number | null>(null);
  const [freeAllowance, setFreeAllowance] = useState<{ remaining: number; limit: number } | null>(
    null
  );
  const [freeAllowanceError, setFreeAllowanceError] = useState<string | null>(null);
  const sentLoading = isConnected && Boolean(address) && sentCount === null;
  const inboxLoading = isConnected && Boolean(address) && inboxCount === null;
  const freeAllowanceLoading =
    isConnected && Boolean(address) && freeAllowance === null && !freeAllowanceError;

  const copyAddress = useCallback(async () => {
    if (!address) return;
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(address);
      toast.success('Address copied.');
    } catch (err) {
      console.error('[home] copy address failed', err);
      toast.error('Unable to copy address.');
    }
  }, [address]);

  useEffect(() => {
    let aborted = false;
    const toSafeCount = (value: unknown): number | null => {
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) return null;
      return Math.max(0, Math.floor(num));
    };

    async function fetchCounts() {
      if (!isConnected || !address) {
        setSentCount(null);
        setInboxCount(null);
        setFreeAllowance(null);
        setFreeAllowanceError(null);
        return;
      }
      try {
        const qsSent = new URLSearchParams({ initiator: address });
        const qsInbox = new URLSearchParams({ recipient: address });
        const allowanceUrl = `/api/send/freeAllowance?address=${encodeURIComponent(address)}`;
        const [resSent, resInbox, resFreeAllowance] = await Promise.all([
          fetch(`/api/sent?${qsSent.toString()}`),
          fetch(`/api/inbox?${qsInbox.toString()}`),
          fetch(allowanceUrl),
        ]);
        const [payloadSent, payloadInbox, payloadFreeAllowance] = await Promise.all([
          resSent.json().catch(() => null),
          resInbox.json().catch(() => null),
          resFreeAllowance.json().catch(() => null),
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

          if (
            resFreeAllowance.ok &&
            payloadFreeAllowance?.success &&
            payloadFreeAllowance.allowance
          ) {
            const remaining = toSafeCount(payloadFreeAllowance.allowance.remaining);
            const limit =
              toSafeCount(payloadFreeAllowance.allowance.limit) ?? FREE_MICRO_SENDS_PER_MONTH;
            if (remaining !== null) {
              setFreeAllowance({ remaining: Math.min(remaining, limit), limit });
              setFreeAllowanceError(null);
            } else {
              setFreeAllowance(null);
              setFreeAllowanceError('Free micro-send balance unavailable.');
            }
          } else {
            const msg =
              typeof payloadFreeAllowance?.error === 'string' &&
              payloadFreeAllowance.error.trim().length > 0
                ? payloadFreeAllowance.error
                : 'Unable to load free micro-sends.';
            setFreeAllowance(null);
            setFreeAllowanceError(msg);
          }
        }
      } catch {
        if (!aborted) {
          setSentCount(0);
          setInboxCount(0);
          setFreeAllowance(null);
          setFreeAllowanceError('Unable to load free micro-sends.');
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
          <div
            style={{
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span>Hello</span>
            {address ? (
              <button
                type="button"
                onClick={copyAddress}
                aria-label="Copy wallet address"
                title="Copy wallet address"
              style={{
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 'inherit',
              }}
            >
              <IdentityBadge address={address} size={4} basicStyle={true} />
            </button>
          ) : null}
          </div>
          {hasBaseName && address ? (
            <div
              className="row"
              style={{ gap: 8, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <button
                type="button"
                onClick={copyAddress}
                aria-label="Copy wallet address"
                title="Copy wallet address"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                }}
              >
                <span className="mono" style={{ fontSize: 12, color: 'var(--accent)' }}>
                  {shortAddr}
                </span>
              </button>
            </div>
          ) : null}
          <div className="muted" style={{ fontSize: 12 }}>
            Check your files
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6, color: '#F7931A' }}>
            {freeAllowanceLoading ? (
              'Checking your free micro-sends…'
          ) : freeAllowance ? (
              <>
                Free micro-sends remaining this month: {freeAllowance.remaining} /{' '}
                {freeAllowance.limit}
              </>
            ) : freeAllowanceError ? (
              freeAllowanceError
            ) : (
              `Free micro-sends remaining this month: — / ${FREE_MICRO_SENDS_PER_MONTH}`
            )}
          </div>
        </div>
        <div className="homeCtaActions">
          <Link
            href="/outbox"
            className="button"
            style={{ textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <span>Open Outbox</span>
            <span
              className="pill"
              aria-label="outbox-active-count"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 24,
              }}
            >
              {sentLoading ? (
                <span className="spinner" aria-hidden />
              ) : typeof sentCount === 'number' ? (
                sentCount
              ) : (
                '—'
              )}
            </span>
          </Link>
          <Link
            href="/inbox"
            className="button"
            style={{ textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <span>Open Inbox</span>
            <span
              className="pill"
              aria-label="inbox-active-count"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 24,
              }}
            >
              {inboxLoading ? (
                <span className="spinner" aria-hidden />
              ) : typeof inboxCount === 'number' ? (
                inboxCount
              ) : (
                '—'
              )}
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

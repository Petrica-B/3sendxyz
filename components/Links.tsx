'use client';

import { explorerAddressUrl, explorerTxUrl, shortAddress, shortHex } from '@/lib/format';
import React from 'react';

export function AddressLink({ address, size = 5 }: { address: string; size?: number }) {
  if (!address) return null;
  const href = explorerAddressUrl(address);
  return (
    <a
      className="mono accentLink"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`View ${address} on Basescan`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: 'var(--accent)',
        fontWeight: 700,
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {shortAddress(address, size)}
    </a>
  );
}

export function TxLink({ tx, size = 5 }: { tx: string; size?: number }) {
  if (!tx) return <span className="muted">—</span>;
  if (!tx.startsWith('0x') || tx.length < 12) return <span className="muted">—</span>;
  const href = explorerTxUrl(tx);
  return (
    <a className="accentLink mono" href={href} target="_blank" rel="noreferrer">
      {shortHex(tx, size)}
    </a>
  );
}

export function NodeLink({ alias }: { alias: string }) {
  if (!alias) return null;
  // Dummy link for node alias
  const href = `https://basescan.org/nodes/${encodeURIComponent(alias)}`;
  return (
    <a className="accentLink mono" href={href} target="_blank" rel="noreferrer">
      {alias}
    </a>
  );
}

export function NodeLinks({ aliases }: { aliases: string[] }) {
  if (!aliases || aliases.length === 0) return <span className="muted">—</span>;
  return (
    <>
      {aliases.map((a, i) => (
        <React.Fragment key={`${a}-${i}`}>
          <NodeLink alias={a} />
          {i < aliases.length - 1 ? ', ' : ''}
        </React.Fragment>
      ))}
    </>
  );
}

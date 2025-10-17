export function shortAddress(addr: string, size = 4) {
  if (!addr) return '';
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

export function shortHex(hex: string, size = 4) {
  if (!hex) return '';
  return `${hex.slice(0, 2 + size)}…${hex.slice(-size)}`;
}

// Explorer helpers (Base mainnet)
export function explorerAddressUrl(addr: string): string {
  return `https://basescan.org/address/${addr}`;
}

export function explorerTxUrl(tx: string): string {
  return `https://basescan.org/tx/${tx}`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString();
}

export function formatDateShort(ts: number, locale: string = 'en-GB') {
  const d = new Date(ts);
  return d.toLocaleDateString(locale);
}

export function daysLeft(expiryTs: number): string {
  const now = Date.now();
  const diff = Math.max(0, expiryTs - now);
  const days = Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export function formatExpiry(ts: number) {
  const now = Date.now();
  const diff = ts - now;
  if (diff <= 0) return 'expired';
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `in ${days}d ${hrs % 24}h`;
  if (hrs > 0) return `in ${hrs}h ${mins % 60}m`;
  return `in ${mins}m`;
}

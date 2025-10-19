import type { Ratio1Packet } from '@/lib/ratio1';

export type OutboxStatus = 'pending' | 'encrypting' | 'sent' | 'failed';

export type OutboxItem = {
  id: string; // packet id
  to: string;
  name: string;
  size: number;
  status: OutboxStatus;
  createdAt: number;
  packetId: string;
  viaNodes?: string[];
  isMock?: boolean;
  details?: MockDetails;
};

export type InboxStatus = 'available' | 'downloaded' | 'expired' | 'ongoing';

export type InboxItem = {
  id: string; // packet id
  from: string;
  name: string;
  size: number;
  createdAt: number;
  expiresAt: number;
  status: InboxStatus;
  packetId: string;
  viaNodes?: string[];
  isMock?: boolean;
  details?: MockDetails;
};

export type MockDetails = {
  peer: string; // from or to address (shortened when displayed)
  tx: string; // fake base tx hash
  via: string[]; // node aliases
  encMsg: string; // short message
  received?: number; // timestamp
  expiring?: number; // timestamp
};

// In-memory packet registry (mock, per-session)
const memoryPackets = new Map<string, Ratio1Packet>();

// Simple pub-sub so pages update when store changes
const listeners = new Set<() => void>();
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    // Ensure cleanup returns void (not boolean)
    listeners.delete(listener);
  };
}
function notify() {
  for (const l of listeners) l();
}

function keyOutbox(addr: string) {
  return `outbox:${addr.toLowerCase()}`;
}
function keyInbox(addr: string) {
  return `inbox:${addr.toLowerCase()}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
  notify();
}

export function deliverPacket(packet: Ratio1Packet) {
  memoryPackets.set(packet.id, packet);
  try {
    localStorage.setItem(`packet:${packet.id}`, JSON.stringify(packet));
  } catch {}
}

export function getPacket(packetId: string): Ratio1Packet | undefined {
  const mem = memoryPackets.get(packetId);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(`packet:${packetId}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Ratio1Packet;
    memoryPackets.set(packetId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export function listOutbox(address: string): OutboxItem[] {
  return read<OutboxItem[]>(keyOutbox(address), []).sort((a, b) => b.createdAt - a.createdAt);
}

export function addOutbox(address: string, item: OutboxItem) {
  const key = keyOutbox(address);
  const list = read<OutboxItem[]>(key, []);
  list.unshift(item);
  write(key, list);
}

export function updateOutboxStatus(address: string, id: string, status: OutboxStatus) {
  const key = keyOutbox(address);
  const list = read<OutboxItem[]>(key, []);
  const idx = list.findIndex((i) => i.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], status };
    write(key, list);
  }
}

export function setOutboxPacket(
  address: string,
  id: string,
  packetId: string,
  viaNodes?: string[]
) {
  const key = keyOutbox(address);
  const list = read<OutboxItem[]>(key, []);
  const idx = list.findIndex((i) => i.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], packetId, viaNodes: viaNodes ?? list[idx].viaNodes };
    write(key, list);
  }
}

export function listInbox(address: string): InboxItem[] {
  const now = Date.now();
  const items = read<InboxItem[]>(keyInbox(address), []);
  // filter out expired and ongoing items (no ongoing section)
  const filtered = items.filter((it) => now <= it.expiresAt && it.status !== 'ongoing');
  if (filtered.length !== items.length) write(keyInbox(address), filtered);
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function addInbox(address: string, item: InboxItem) {
  const key = keyInbox(address);
  const list = read<InboxItem[]>(key, []);
  list.unshift(item);
  write(key, list);
}

export function markInboxDownloaded(address: string, id: string) {
  const key = keyInbox(address);
  const list = read<InboxItem[]>(key, []);
  const idx = list.findIndex((i) => i.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], status: 'downloaded' };
    write(key, list);
  }
}

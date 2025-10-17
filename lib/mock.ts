"use client";

import { addInbox, addOutbox } from '@/lib/store';

function seededKey(address: string) {
  return `seeded:v2:${address.toLowerCase()}`;
}

function hexAddr(suffix: string) {
  return `0x${suffix.padStart(40, '0')}`;
}

function randomRecent(msBack: number) {
  const now = Date.now();
  const delta = Math.floor(Math.random() * msBack);
  return now - delta;
}

export async function seedMockForAddress(address: string) {
  const key = seededKey(address);
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(key)) return;
  // Reset lists to keep exactly 4+4 items per seed
  try {
    localStorage.setItem(`outbox:${address.toLowerCase()}`, JSON.stringify([]));
    localStorage.setItem(`inbox:${address.toLowerCase()}`, JSON.stringify([]));
  } catch {}

  // Add 4 dummy outbox items with full details
  function randHex(len: number) { const chars = '0123456789abcdef'; let s = ''; for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)]; return s; }
  function randomAddress() { return `0x${randHex(40)}`; }
  function randomTx() { return `0x${randHex(64)}`; }
  function randomMsg() {
    const msgs = [
      'your seed phrase',
      'meeting notes',
      'draft contract',
      'design preview',
      'api token',
      'otp backup',
    ];
    return msgs[Math.floor(Math.random()*msgs.length)];
  }
  const now = Date.now();
  const outFiles = [
    'proposal-v3.pdf',
    'wireframe.png',
    'backup.key',
    'photos.tar.gz',
  ];
  for (let i = 0; i < 4; i++) {
    const createdAt = now - Math.floor(Math.random() * (1000 * 60 * 60 * 24 * 5));
    const expiresAt = now + (1000 * 60 * 60 * 24 * (7 + Math.floor(Math.random() * 21)));
    addOutbox(address, {
      id: `dummy-out-${Date.now()}-${i}`,
      to: randomAddress(),
      name: outFiles[i],
      size: Math.floor((0.2 + Math.random() * 8) * 1024 * 1024),
      status: 'sent',
      createdAt,
      packetId: `dummy-packet-out-${i}`,
      viaNodes: ['draco', 'lyra', 'aether'],
      isMock: true,
      details: {
        peer: randomAddress(),
        tx: randomTx(),
        via: ['draco', 'lyra', 'aether'],
        encMsg: randomMsg(),
        received: createdAt,
        expiring: expiresAt,
      },
    });
  }

  // Add 4 dummy inbox items with full details
  const files = [
    'statement-aug.csv',
    'sprints-roadmap.pdf',
    'screens-v2.zip',
    'nda-signed.docx',
  ];
  for (let i = 0; i < 4; i++) {
    const createdAt = now - Math.floor(Math.random() * (1000 * 60 * 60 * 24 * 5));
    const expiresAt = now + (1000 * 60 * 60 * 24 * (7 + Math.floor(Math.random() * 21))); // 7-28 days
    addInbox(address, {
      id: `dummy-${Date.now()}-${i}`,
      from: randomAddress(),
      name: files[i],
      size: Math.floor(Math.random() * 5 * 1024 * 1024),
      createdAt,
      expiresAt,
      status: 'available',
      packetId: `dummy-packet-${i}`,
      viaNodes: ['draco', 'lyra', 'aether'],
      isMock: true,
      details: {
        peer: randomAddress(),
        tx: randomTx(),
        via: ['draco', 'lyra', 'aether'],
        encMsg: randomMsg(),
        received: createdAt,
        expiring: expiresAt,
      },
    });
  }

  // No ongoing items

  localStorage.setItem(key, '1');
}

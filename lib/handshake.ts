import type { EncryptionMetadata } from '@/lib/types';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const SEND_HANDSHAKE_HEADER = 'ratio1 handshake (send)';
const SEND_HANDSHAKE_INTRO = 'I authorize sending an encrypted file via 3send.xyz.';

type CanonicalPrimitive = string | number | boolean;

export type BuildSendHandshakeMessageParams = {
  initiator: string;
  recipient: string;
  chainId: number;
  paymentTxHash: string;
  sentAt: number;
  tierId: number;
  plaintextBytes: number;
  ciphertextBytes: number;
  originalFilename?: string;
  encryption: EncryptionMetadata;
};

export type ParsedSendHandshakeMessage = {
  sender: string;
  recipient: string;
  chainId: number;
  paymentTxHash: string;
  sentAtMs: number;
  tierId: number;
  plaintextBytes: number;
  ciphertextBytes: number;
  originalFilename?: string;
  metadataDigest: string;
};

function normalizeAddress(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('0x')) {
    return `0x${trimmed.toLowerCase()}`;
  }
  return `0x${trimmed.slice(2).toLowerCase()}`;
}

function normalizeHex(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('0x')) {
    return `0x${trimmed.toLowerCase()}`;
  }
  return `0x${trimmed.slice(2).toLowerCase()}`;
}

function sanitizeDisplayValue(value: string): string {
  return value.replace(/[\r\n]/g, ' ').replace(/:/g, '-').replace(/\s+/g, ' ').trim();
}

function toSafeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Handshake value must be a finite number');
  }
  return Math.max(0, Math.floor(value));
}

function canonicalizeEncryptionMetadata(metadata: EncryptionMetadata): Record<string, CanonicalPrimitive> {
  const canonical: Record<string, CanonicalPrimitive> = {};
  const keys = Object.keys(metadata) as (keyof EncryptionMetadata)[];
  keys.sort();
  for (const key of keys) {
    const value = metadata[key];
    if (value === undefined || value === null) {
      continue;
    }
    canonical[key as string] = value as CanonicalPrimitive;
  }
  return canonical;
}

export function computeEncryptionMetadataDigest(metadata: EncryptionMetadata): string {
  const canonical = canonicalizeEncryptionMetadata(metadata);
  const encoded = utf8ToBytes(JSON.stringify(canonical));
  const digest = sha256(encoded);
  return `0x${bytesToHex(digest)}`;
}

export function buildSendHandshakeMessage(params: BuildSendHandshakeMessageParams): string {
  const sender = normalizeAddress(params.initiator);
  const recipient = normalizeAddress(params.recipient);
  const paymentTx = normalizeHex(params.paymentTxHash);
  const sentAt = toSafeInteger(params.sentAt);
  const plaintextBytes = toSafeInteger(params.plaintextBytes);
  const ciphertextBytes = toSafeInteger(params.ciphertextBytes);
  const metadataDigest = computeEncryptionMetadataDigest(params.encryption);
  const filename = typeof params.originalFilename === 'string' ? sanitizeDisplayValue(params.originalFilename) : '';
  const lines = [
    SEND_HANDSHAKE_HEADER,
    SEND_HANDSHAKE_INTRO,
    '',
    `Sender: ${sender}`,
    `Recipient: ${recipient}`,
    `Chain ID: ${params.chainId}`,
    `Payment Tx: ${paymentTx}`,
    `Sent At (ms): ${sentAt}`,
    `Tier ID: ${toSafeInteger(params.tierId)}`,
    `Plaintext Bytes: ${plaintextBytes}`,
    `Ciphertext Bytes: ${ciphertextBytes}`,
  ];
  if (filename.length > 0) {
    lines.push(`Original Filename: ${filename}`);
  }
  lines.push(`Encryption Metadata SHA-256: ${metadataDigest}`);
  return lines.join('\n');
}

function ensureHeader(lines: string[]): void {
  if (lines[0] !== SEND_HANDSHAKE_HEADER) {
    throw new Error('Unexpected handshake header');
  }
  if (lines[1] !== SEND_HANDSHAKE_INTRO) {
    throw new Error('Unexpected handshake intro');
  }
}

function parseRequiredNumber(map: Map<string, string>, key: string): number {
  const raw = map.get(key);
  if (!raw) {
    throw new Error(`Missing handshake field: ${key}`);
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid handshake number: ${key}`);
  }
  return value;
}

export function parseSendHandshakeMessage(message: string): ParsedSendHandshakeMessage {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Handshake message is empty');
  }

  const normalized = message.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length < 3) {
    throw new Error('Handshake message is incomplete');
  }
  ensureHeader(lines);

  const fieldLines = lines.slice(2).filter((line) => line.trim().length > 0);
  const fields = new Map<string, string>();
  for (const line of fieldLines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error(`Malformed handshake line: ${line}`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      throw new Error(`Malformed handshake line: ${line}`);
    }
    fields.set(key, value);
  }

  const senderRaw = fields.get('Sender');
  const recipientRaw = fields.get('Recipient');
  const paymentTxRaw = fields.get('Payment Tx');
  const metadataDigest = fields.get('Encryption Metadata SHA-256');

  if (!senderRaw || !recipientRaw || !paymentTxRaw || !metadataDigest) {
    throw new Error('Handshake message missing required identity fields');
  }

  const sender = normalizeAddress(senderRaw);
  const recipient = normalizeAddress(recipientRaw);
  const paymentTxHash = normalizeHex(paymentTxRaw);
  const chainId = parseRequiredNumber(fields, 'Chain ID');
  const sentAtMs = parseRequiredNumber(fields, 'Sent At (ms)');
  const tierId = parseRequiredNumber(fields, 'Tier ID');
  const plaintextBytes = parseRequiredNumber(fields, 'Plaintext Bytes');
  const ciphertextBytes = parseRequiredNumber(fields, 'Ciphertext Bytes');
  const originalFilename = fields.has('Original Filename')
    ? fields.get('Original Filename') ?? undefined
    : undefined;
  const digest = normalizeHex(metadataDigest);

  return {
    sender,
    recipient,
    chainId,
    paymentTxHash,
    sentAtMs,
    tierId,
    plaintextBytes,
    ciphertextBytes,
    originalFilename,
    metadataDigest: digest,
  };
}

export function normalizeHandshakeDisplayValue(value: string): string {
  return sanitizeDisplayValue(value);
}

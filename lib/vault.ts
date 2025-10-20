import { Buffer } from 'node:buffer';
import {
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
} from 'node:crypto';

import { VAULT_PRIVATE_KEY_MIN_SECRET_LENGTH } from './constants';
import type { VaultKeyRecord } from './types';

const ENCRYPTION_IV_BYTES = 12;
const ENCRYPTION_SALT_BYTES = 16;
const ENCRYPTION_KEY_BYTES = 32;

export function parseVaultRecord(raw: string | null | undefined): VaultKeyRecord | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<VaultKeyRecord>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.publicKey !== 'string') return null;
    if (typeof parsed.privateKey !== 'string') return null;

    return {
      publicKey: parsed.publicKey,
      privateKey: parsed.privateKey,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : undefined,
    };
  } catch {
    return null;
  }
}

export function getVaultPrivateKeySecret(): string {
  const secret = process.env.VAULT_PRIVATE_KEY_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('VAULT_PRIVATE_KEY_SECRET is not configured');
  }
  if (secret.length < VAULT_PRIVATE_KEY_MIN_SECRET_LENGTH) {
    throw new Error(
      `VAULT_PRIVATE_KEY_SECRET must be at least ${VAULT_PRIVATE_KEY_MIN_SECRET_LENGTH} characters long`,
    );
  }
  return secret;
}

export function encryptPrivateKey(rawPrivateKey: Buffer, secret: string): string {
  const salt = randomBytes(ENCRYPTION_SALT_BYTES);
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const key = scryptSync(secret, salt, ENCRYPTION_KEY_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(rawPrivateKey), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, ciphertext]).toString('base64');
}

export function decryptPrivateKey(encryptedPrivateKey: string, secret: string): Buffer {
  const payload = Buffer.from(encryptedPrivateKey, 'base64');
  if (payload.length < ENCRYPTION_SALT_BYTES + ENCRYPTION_IV_BYTES + 16) {
    throw new Error('Encrypted private key payload is malformed');
  }

  const salt = payload.subarray(0, ENCRYPTION_SALT_BYTES);
  const iv = payload.subarray(ENCRYPTION_SALT_BYTES, ENCRYPTION_SALT_BYTES + ENCRYPTION_IV_BYTES);
  const authTagStart = ENCRYPTION_SALT_BYTES + ENCRYPTION_IV_BYTES;
  const authTagEnd = authTagStart + 16;
  const authTag = payload.subarray(authTagStart, authTagEnd);
  const ciphertext = payload.subarray(authTagEnd);

  const key = scryptSync(secret, salt, ENCRYPTION_KEY_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function createVaultRecord(secret: string): VaultKeyRecord {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  const publicKeyDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
  const privateKeyDer = Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' }));

  const rawPublicKey = publicKeyDer.subarray(publicKeyDer.length - 32);

  const privateKeyMarker = Buffer.from([0x04, 0x20]);
  const markerIndex = privateKeyDer.indexOf(privateKeyMarker);
  if (markerIndex === -1) {
    throw new Error('Unsupported private key encoding for x25519');
  }
  const rawPrivateKey = privateKeyDer.subarray(markerIndex + privateKeyMarker.length);
  if (rawPrivateKey.length < 32) {
    throw new Error('Invalid private key length for x25519');
  }
  const privateKeyRaw32 = rawPrivateKey.subarray(0, 32);

  const publicKeyBase64 = rawPublicKey.toString('base64');
  const encryptedPrivateKey = encryptPrivateKey(privateKeyRaw32, secret);

  return {
    publicKey: publicKeyBase64,
    privateKey: encryptedPrivateKey,
    createdAt: Date.now(),
  };
}

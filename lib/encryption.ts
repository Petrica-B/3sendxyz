import type { EncryptionMetadata } from '@/lib/types';
import { x25519 } from '@noble/curves/ed25519';

const AES_GCM_IV_BYTES = 12;

function ensureCrypto(): Crypto & { subtle: SubtleCrypto } {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error('WebCrypto is not available in this environment');
  }
  return cryptoObj as Crypto & { subtle: SubtleCrypto };
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64(base64: string): Uint8Array {
  const normalized = base64.trim();
  if (normalized.length === 0) {
    return new Uint8Array();
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type EncryptFileParams = {
  file: File;
  recipientPublicKey: string;
  recipientAddress?: string;
};

export type EncryptFileResult = {
  encryptedFile: File;
  metadata: EncryptionMetadata;
};

export async function encryptFileForRecipient(params: EncryptFileParams): Promise<EncryptFileResult> {
  const { file, recipientPublicKey, recipientAddress } = params;

  const cryptoObj = ensureCrypto();
  const recipientKeyBytes = decodeBase64(recipientPublicKey);
  if (recipientKeyBytes.length !== 32) {
    throw new Error('Receiver public key must be 32 bytes');
  }

  const ephemeralPrivateKey = x25519.utils.randomPrivateKey();
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, recipientKeyBytes);
  const sharedSecretBytes = new Uint8Array(sharedSecret);
  const sharedSecretBuffer = sharedSecretBytes.buffer.slice(
    sharedSecretBytes.byteOffset,
    sharedSecretBytes.byteOffset + sharedSecretBytes.byteLength
  );

  const keyMaterial = await cryptoObj.subtle.digest('SHA-256', sharedSecretBuffer);
  const encryptionKey = await cryptoObj.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const iv = cryptoObj.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const plainBuffer = await file.arrayBuffer();
  const ciphertextBuffer = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encryptionKey,
    plainBuffer
  );
  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  const encryptedFile = new File([ciphertextBytes], file.name, {
    type: 'application/octet-stream',
    lastModified: file.lastModified,
  });

  const metadata: EncryptionMetadata = {
    version: 'x25519-aesgcm/v1',
    algorithm: 'X25519-AES-GCM',
    keyDerivation: 'sha256',
    ephemeralPublicKey: encodeBase64(ephemeralPublicKey),
    iv: encodeBase64(iv),
    recipientPublicKey,
    plaintextLength: plainBuffer.byteLength,
    ciphertextLength: ciphertextBytes.byteLength,
    recipient: recipientAddress?.toLowerCase(),
  };

  return { encryptedFile, metadata };
}

export type DecryptFileParams = {
  ciphertext: Uint8Array;
  metadata: EncryptionMetadata;
  recipientPrivateKey: Uint8Array;
};

export async function decryptFileFromEnvelope(params: DecryptFileParams): Promise<Uint8Array> {
  const { ciphertext, metadata, recipientPrivateKey } = params;
  const cryptoObj = ensureCrypto();

  if (recipientPrivateKey.length !== 32) {
    throw new Error('Recipient private key must be 32 bytes');
  }

  if (!metadata || typeof metadata !== 'object') {
    throw new Error('Missing encryption metadata');
  }

  const { version, algorithm } = metadata;
  if (typeof version === 'string' && version !== 'x25519-aesgcm/v1') {
    throw new Error(`Unsupported encryption envelope version: ${version}`);
  }
  if (typeof algorithm === 'string' && !algorithm.toUpperCase().includes('AES-GCM')) {
    throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
  }

  const ephemeralPublicKeyBytes = decodeBase64(metadata.ephemeralPublicKey);
  if (ephemeralPublicKeyBytes.length !== 32) {
    throw new Error('Invalid ephemeral public key');
  }
  const ivBytes = decodeBase64(metadata.iv);
  if (ivBytes.length !== AES_GCM_IV_BYTES) {
    throw new Error('Invalid IV length');
  }

  const sharedSecret = x25519.getSharedSecret(recipientPrivateKey, ephemeralPublicKeyBytes);
  const sharedSecretBytes = new Uint8Array(sharedSecret);
  const sharedSecretBuffer = sharedSecretBytes.buffer.slice(
    sharedSecretBytes.byteOffset,
    sharedSecretBytes.byteOffset + sharedSecretBytes.byteLength
  );

  const keyMaterial = await cryptoObj.subtle.digest('SHA-256', sharedSecretBuffer);
  const decryptionKey = await cryptoObj.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const ivBuffer = ivBytes.buffer.slice(
    ivBytes.byteOffset,
    ivBytes.byteOffset + ivBytes.byteLength
  ) as ArrayBuffer;
  const ciphertextBuffer = ciphertext.buffer.slice(
    ciphertext.byteOffset,
    ciphertext.byteOffset + ciphertext.byteLength
  ) as ArrayBuffer;

  const plainBuffer = await cryptoObj.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    decryptionKey,
    ciphertextBuffer
  );

  return new Uint8Array(plainBuffer);
}

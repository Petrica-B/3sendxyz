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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function validateEnvelopeMetadata(metadata: EncryptionMetadata): void {
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
}

async function deriveDecryptionKey(
  cryptoObj: Crypto & { subtle: SubtleCrypto },
  metadata: EncryptionMetadata,
  recipientPrivateKey: Uint8Array
): Promise<CryptoKey> {
  if (recipientPrivateKey.length !== 32) {
    throw new Error('Recipient private key must be 32 bytes');
  }
  const ephemeralPublicKeyBytes = decodeBase64(metadata.ephemeralPublicKey);
  if (ephemeralPublicKeyBytes.length !== 32) {
    throw new Error('Invalid ephemeral public key');
  }
  const sharedSecret = x25519.getSharedSecret(recipientPrivateKey, ephemeralPublicKeyBytes);
  const sharedSecretBytes = new Uint8Array(sharedSecret);
  const keyMaterial = await cryptoObj.subtle.digest('SHA-256', toArrayBuffer(sharedSecretBytes));
  return cryptoObj.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
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
  note?: string;
};

export type EncryptFileResult = {
  encryptedFile: File;
  metadata: EncryptionMetadata;
};

export async function encryptFileForRecipient(params: EncryptFileParams): Promise<EncryptFileResult> {
  const { file, recipientPublicKey, recipientAddress, note } = params;

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
  const ciphertextBuffer = await cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, plainBuffer);
  const ciphertextBytes = new Uint8Array(ciphertextBuffer);

  const noteEncoding: 'utf-8' = 'utf-8';
  let noteCiphertextB64: string | undefined;
  let noteIvB64: string | undefined;
  let noteLength: number | undefined;
  if (typeof note === 'string' && note.length > 0) {
    const noteBytes = new TextEncoder().encode(note);
    const noteIv = cryptoObj.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
    const noteBuffer = await cryptoObj.subtle.encrypt(
      { name: 'AES-GCM', iv: noteIv },
      encryptionKey,
      noteBytes.buffer.slice(noteBytes.byteOffset, noteBytes.byteOffset + noteBytes.byteLength)
    );
    const noteCiphertextBytes = new Uint8Array(noteBuffer);
    noteCiphertextB64 = encodeBase64(noteCiphertextBytes);
    noteIvB64 = encodeBase64(noteIv);
    noteLength = noteBytes.length;
  }

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
  if (noteCiphertextB64 && noteIvB64) {
    metadata.noteCiphertext = noteCiphertextB64;
    metadata.noteIv = noteIvB64;
    metadata.noteEncoding = noteEncoding;
    metadata.noteLength = noteLength;
  }

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

  validateEnvelopeMetadata(metadata);
  const ivBytes = decodeBase64(metadata.iv);
  if (ivBytes.length !== AES_GCM_IV_BYTES) {
    throw new Error('Invalid IV length');
  }

  const decryptionKey = await deriveDecryptionKey(cryptoObj, metadata, recipientPrivateKey);

  const ivBuffer = toArrayBuffer(ivBytes);
  const ciphertextBuffer = toArrayBuffer(ciphertext);

  const plainBuffer = await cryptoObj.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    decryptionKey,
    ciphertextBuffer
  );

  return new Uint8Array(plainBuffer);
}

export type DecryptNoteParams = {
  metadata: EncryptionMetadata;
  recipientPrivateKey: Uint8Array;
};

export async function decryptNoteFromEnvelope(params: DecryptNoteParams): Promise<string> {
  const { metadata, recipientPrivateKey } = params;
  const cryptoObj = ensureCrypto();
  validateEnvelopeMetadata(metadata);

  if (!metadata.noteCiphertext || !metadata.noteIv) {
    throw new Error('Encrypted note not found in envelope');
  }

  const ivBytes = decodeBase64(metadata.noteIv);
  if (ivBytes.length !== AES_GCM_IV_BYTES) {
    throw new Error('Invalid note IV length');
  }
  const ciphertextBytes = decodeBase64(metadata.noteCiphertext);
  if (ciphertextBytes.length === 0) {
    return '';
  }

  const decryptionKey = await deriveDecryptionKey(cryptoObj, metadata, recipientPrivateKey);
  const plainBuffer = await cryptoObj.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
    decryptionKey,
    toArrayBuffer(ciphertextBytes)
  );

  const encoding = metadata.noteEncoding ?? 'utf-8';
  const decoder = new TextDecoder(encoding);
  const plainBytes = new Uint8Array(plainBuffer);
  return decoder.decode(plainBytes);
}

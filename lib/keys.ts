import { x25519 } from '@noble/curves/ed25519';
import { generateMnemonic as bip39GenerateMnemonic, validateMnemonic as bip39ValidateMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';

// Client-side RSA key generation and export helpers

type CryptoGlobal = typeof globalThis & { crypto?: Crypto };

export type GeneratedKeyPair = {
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprintHex: string;
  createdAt: number;
};

function toPem(base64: string, header: string, footer: string): string {
  const chunks = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${header}-----\n${chunks.join('\n')}\n-----END ${footer}-----`;
}

async function exportKey(key: CryptoKey, format: 'spki' | 'pkcs8'): Promise<ArrayBuffer> {
  const subtle: SubtleCrypto | undefined = (globalThis as CryptoGlobal).crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto not available');
  return subtle.exportKey(format, key);
}

function ab2b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function ab2hex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeMnemonicInternal(mnemonic: string): string {
  const normalized = mnemonic.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
  if (!normalized) {
    throw new Error('Seed phrase is empty');
  }
  return normalized;
}

function entropyStrengthFromWordCount(wordCount: number): number {
  if (wordCount < 12 || wordCount > 24 || wordCount % 3 !== 0) {
    throw new Error('Word count must be one of 12, 15, 18, 21, or 24 words.');
  }
  return (wordCount / 3) * 32;
}

export async function generateRsaKeyPair(): Promise<GeneratedKeyPair> {
  const cryptoObj: Crypto | undefined = (globalThis as CryptoGlobal).crypto;
  const subtle: SubtleCrypto | undefined = cryptoObj?.subtle;
  if (!subtle) throw new Error('WebCrypto not available');

  const keyPair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const spki = await exportKey(keyPair.publicKey, 'spki');
  const pkcs8 = await exportKey(keyPair.privateKey, 'pkcs8');
  const publicB64 = ab2b64(spki);
  const privateB64 = ab2b64(pkcs8);
  const pubPem = toPem(publicB64, 'PUBLIC KEY', 'PUBLIC KEY');
  const privPem = toPem(privateB64, 'PRIVATE KEY', 'PRIVATE KEY');
  const digest = await subtle.digest('SHA-256', spki);
  const fingerprintHex = ab2hex(digest);

  return {
    publicKeyPem: pubPem,
    privateKeyPem: privPem,
    fingerprintHex,
    createdAt: Date.now(),
  };
}

export type GeneratedMnemonicPair = {
  mnemonic: string; // 12-word private key phrase
  words: string[];
  fingerprintHex: string;
  createdAt: number;
};

export async function generateMnemonicKeyPair(wordCount = 12): Promise<GeneratedMnemonicPair> {
  const cryptoObj: Crypto | undefined = (globalThis as CryptoGlobal).crypto;
  const subtle: SubtleCrypto | undefined = cryptoObj?.subtle;
  if (!cryptoObj || !subtle) throw new Error('WebCrypto not available');
  const strength = entropyStrengthFromWordCount(wordCount);
  const mnemonic = bip39GenerateMnemonic(englishWordlist, strength);
  const normalized = normalizeMnemonicInternal(mnemonic);
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const fingerprintHex = ab2hex(digest);
  return { mnemonic: normalized, words: normalized.split(' '), fingerprintHex, createdAt: Date.now() };
}

export type DerivedSeedKeyPair = {
  privateKey: Uint8Array;
  publicKeyBase64: string;
};

export async function deriveSeedKeyPair(mnemonic: string): Promise<DerivedSeedKeyPair> {
  const normalized = normalizeMnemonicInternal(mnemonic);
  const cryptoObj: Crypto | undefined = (globalThis as CryptoGlobal).crypto;
  const subtle: SubtleCrypto | undefined = cryptoObj?.subtle;
  if (!cryptoObj || !subtle) throw new Error('WebCrypto not available');
  const seedBytes = new TextEncoder().encode(normalized);
  const digest = await subtle.digest('SHA-256', seedBytes);
  const privateKey = new Uint8Array(digest);
  const publicKeyBytes = x25519.getPublicKey(privateKey);
  const buffer = new ArrayBuffer(publicKeyBytes.byteLength);
  new Uint8Array(buffer).set(publicKeyBytes);
  const publicKeyBase64 = ab2b64(buffer);
  return { privateKey, publicKeyBase64 };
}

export async function fingerprintMnemonic(mnemonic: string): Promise<string> {
  const normalized = normalizeMnemonicInternal(mnemonic);
  const cryptoObj: Crypto | undefined = (globalThis as CryptoGlobal).crypto;
  const subtle: SubtleCrypto | undefined = cryptoObj?.subtle;
  if (!cryptoObj || !subtle) throw new Error('WebCrypto not available');
  const seedBytes = new TextEncoder().encode(normalized);
  const digest = await subtle.digest('SHA-256', seedBytes);
  return ab2hex(digest);
}

export function isValidMnemonic(mnemonic: string): boolean {
  try {
    const normalized = normalizeMnemonicInternal(mnemonic);
    return bip39ValidateMnemonic(normalized, englishWordlist);
  } catch {
    return false;
  }
}

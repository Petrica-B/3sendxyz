import { VAULT_CSTORE_HKEY } from '@/lib/constants';
import type { VaultKeyRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { generateKeyPairSync } from 'node:crypto';

export const runtime = 'nodejs';

function parseVaultRecord(raw: string | null | undefined): VaultKeyRecord | null {
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
      algorithm: typeof parsed.algorithm === 'string' ? parsed.algorithm : undefined,
      encoding:
        parsed.encoding === 'base64' || parsed.encoding === 'hex' ? parsed.encoding : undefined,
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : undefined,
    };
  } catch {
    return null;
  }
}

function createVaultRecord(): VaultKeyRecord {
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
  const privateKeyBase64 = privateKeyRaw32.toString('base64');

  return {
    publicKey: publicKeyBase64,
    privateKey: privateKeyBase64,
    algorithm: 'x25519',
    encoding: 'base64',
    createdAt: Date.now(),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
  }

  try {
    const ratio1 = createEdgeSdk();
    const addressKey = address.toLowerCase();

    let record: VaultKeyRecord | null = null;

    try {
      const existing = await ratio1.cstore.hget({
        hkey: VAULT_CSTORE_HKEY,
        key: addressKey,
      });
      const existingValue =
        typeof existing === 'string'
          ? existing
          : existing && typeof existing === 'object' && 'result' in existing
            ? (existing as { result?: unknown }).result
            : null;
      record = parseVaultRecord(typeof existingValue === 'string' ? existingValue : null);
    } catch (error) {
      console.warn('[vault] hget failed', error);
    }

    if (!record) {
      record = createVaultRecord();
      await ratio1.cstore.hset({
        hkey: VAULT_CSTORE_HKEY,
        key: addressKey,
        value: JSON.stringify(record),
      });
    }

    return NextResponse.json({
      success: true,
      type: 'vault',
      publicKey: record.publicKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[vault] Failed to resolve vault public key', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

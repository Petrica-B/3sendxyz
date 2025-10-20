import { PASSKEY_CSTORE_HKEY, VAULT_CSTORE_HKEY } from '@/lib/constants';
import { createVaultRecord, getVaultPrivateKeySecret, parseVaultRecord } from '@/lib/vault';
import type { PasskeyRecord, VaultKeyRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function parsePasskeyRecord(raw: string | null | undefined): PasskeyRecord | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as PasskeyRecord;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.credentialId !== 'string') return null;
    if (typeof parsed.publicKey !== 'string') return null;
    const prfSalt = typeof parsed.prfSalt === 'string' ? parsed.prfSalt : '';
    return {
      credentialId: parsed.credentialId,
      publicKey: parsed.publicKey,
      algorithm: typeof parsed.algorithm === 'number' ? parsed.algorithm : undefined,
      createdAt:
        typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
          ? parsed.createdAt
          : Date.now(),
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
      prfSalt,
    };
  } catch {
    return null;
  }
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

    let passkey: PasskeyRecord | null = null;
    try {
      const passkeyExisting = await ratio1.cstore.hget({
        hkey: PASSKEY_CSTORE_HKEY,
        key: addressKey,
      });
      const passkeyValue =
        typeof passkeyExisting === 'string'
          ? passkeyExisting
          : passkeyExisting && typeof passkeyExisting === 'object' && 'result' in passkeyExisting
            ? (passkeyExisting as { result?: unknown }).result
            : null;
      passkey = parsePasskeyRecord(typeof passkeyValue === 'string' ? passkeyValue : null);
    } catch (error) {
      console.warn('[passkey] hget failed', error);
    }

    if (passkey?.publicKey) {
      return NextResponse.json({
        success: true,
        type: 'passkey',
        publicKey: passkey.publicKey,
      });
    }

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
      const secret = getVaultPrivateKeySecret();
      record = createVaultRecord(secret);
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
    console.error('[vault] Failed to resolve receiver public key', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

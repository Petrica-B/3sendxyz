import { PASSKEY_CSTORE_HKEY, VAULT_CSTORE_HKEY } from '@/lib/constants';
import { parsePasskeyRecord } from '@/lib/passkey';
import type { PasskeyRecord, VaultKeyRecord } from '@/lib/types';
import { createVaultRecord, getVaultPrivateKeySecret, parseVaultRecord } from '@/lib/vault';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
      const passkeyValue = await ratio1.cstore.hget({
        hkey: PASSKEY_CSTORE_HKEY,
        key: addressKey,
      });
      passkey = parsePasskeyRecord(passkeyValue);
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
      const existingValue = await ratio1.cstore.hget({
        hkey: VAULT_CSTORE_HKEY,
        key: addressKey,
      });
      record = parseVaultRecord(existingValue);
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

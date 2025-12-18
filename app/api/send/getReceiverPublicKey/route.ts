import { REGISTERED_KEYS_CSTORE_HKEY, VAULT_CSTORE_HKEY } from '@/lib/constants';
import { parseIdentityKey } from '@/lib/identityKey';
import { parseRegisteredKeyRecord } from '@/lib/passkey';
import type { RegisteredKeyRecord, VaultKeyRecord } from '@/lib/types';
import { createVaultRecord, getVaultPrivateKeySecret, parseVaultRecord } from '@/lib/vault';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identityInput = url.searchParams.get('identity') ?? url.searchParams.get('address');

  if (!identityInput || typeof identityInput !== 'string' || identityInput.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing identity' }, { status: 400 });
  }

  const identity = parseIdentityKey(identityInput);
  if (!identity) {
    return NextResponse.json({ success: false, error: 'Invalid identity' }, { status: 400 });
  }

  try {
    const ratio1 = createEdgeSdk();
    const keysToCheck = [identity.storageKey, ...identity.legacyKeys];

    let registeredKey: RegisteredKeyRecord | null = null;
    for (const key of keysToCheck) {
      try {
        const storedValue = await ratio1.cstore.hget({
          hkey: REGISTERED_KEYS_CSTORE_HKEY,
          key,
        });
        registeredKey = parseRegisteredKeyRecord(storedValue);
        if (registeredKey) break;
      } catch (error) {
        console.warn('[keys] hget failed', error);
      }
    }

    if (registeredKey?.publicKey) {
      return NextResponse.json({
        success: true,
        type: registeredKey.type,
        publicKey: registeredKey.publicKey,
      });
    }

    let record: VaultKeyRecord | null = null;
    for (const key of keysToCheck) {
      try {
        const existingValue = await ratio1.cstore.hget({
          hkey: VAULT_CSTORE_HKEY,
          key,
        });
        record = parseVaultRecord(existingValue);
        if (record) break;
      } catch (error) {
        console.warn('[vault] hget failed', error);
      }
    }

    if (!record) {
      const secret = getVaultPrivateKeySecret();
      record = createVaultRecord(secret);
      await ratio1.cstore.hset({
        hkey: VAULT_CSTORE_HKEY,
        key: identity.storageKey,
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

import { REGISTERED_KEYS_CSTORE_HKEY, VAULT_CSTORE_HKEY } from '@/lib/constants';
import { parseRegisteredKeyRecord } from '@/lib/passkey';
import type { RegisteredKeyRecord, VaultKeyRecord } from '@/lib/types';
import { createVaultRecord, getVaultPrivateKeySecret, parseVaultRecord } from '@/lib/vault';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { jsonWithServer } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return jsonWithServer({ success: false, error: 'Missing address' }, { status: 400 });
  }

  try {
    const ratio1 = createEdgeSdk();
    const addressKey = address.toLowerCase();

    let registeredKey: RegisteredKeyRecord | null = null;
    try {
      const storedValue = await ratio1.cstore.hget({
        hkey: REGISTERED_KEYS_CSTORE_HKEY,
        key: addressKey,
      });
      registeredKey = parseRegisteredKeyRecord(storedValue);
    } catch (error) {
      console.warn('[keys] hget failed', error);
    }

    if (registeredKey?.publicKey) {
      return jsonWithServer({
        success: true,
        type: registeredKey.type,
        publicKey: registeredKey.publicKey,
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

    return jsonWithServer({
      success: true,
      type: 'vault',
      publicKey: record.publicKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[vault] Failed to resolve receiver public key', error);
    return jsonWithServer({ success: false, error: message }, { status: 500 });
  }
}

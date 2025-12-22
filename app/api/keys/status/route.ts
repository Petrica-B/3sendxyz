import { jsonWithServer } from '@/lib/api';
import { REGISTERED_KEYS_CSTORE_HKEY } from '@/lib/constants';
import { parseRegisteredKeyRecord } from '@/lib/passkey';
import type { RegisteredKeyRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { getAddress } from 'viem';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return jsonWithServer({ success: false, error: 'Missing address' }, { status: 400 });
  }

  let normalized: string;
  try {
    normalized = getAddress(address);
  } catch {
    return jsonWithServer({ success: false, error: 'Invalid address' }, { status: 400 });
  }

  try {
    const ratio1 = createEdgeSdk();
    const key = normalized.toLowerCase();
    let record: RegisteredKeyRecord | null = null;
    try {
      const value = await ratio1.cstore.hget<string>({
        hkey: REGISTERED_KEYS_CSTORE_HKEY,
        key,
      });
      record = parseRegisteredKeyRecord(value);
    } catch (error) {
      console.warn('[keys] hget failed', error);
    }

    return jsonWithServer({
      success: true,
      address: normalized,
      record,
      hasKey: Boolean(record),
      keyType: record?.type ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[keys] Failed to fetch status', error);
    return jsonWithServer({ success: false, error: message }, { status: 500 });
  }
}

import { PASSKEY_CSTORE_HKEY } from '@/lib/constants';
import { parsePasskeyRecord } from '@/lib/passkey';
import type { PasskeyRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';
import { getAddress } from 'viem';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
  }

  let normalized: string;
  try {
    normalized = getAddress(address);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid address' }, { status: 400 });
  }

  try {
    const ratio1 = createEdgeSdk();
    const key = normalized.toLowerCase();
    let record: PasskeyRecord | null = null;
    try {
      const value = await ratio1.cstore.hget({
        hkey: PASSKEY_CSTORE_HKEY,
        key,
      });
      record = parsePasskeyRecord(value);
    } catch (error) {
      console.warn('[passkeys] hget failed', error);
    }

    return NextResponse.json({
      success: true,
      address: normalized,
      record,
      hasPasskey: Boolean(record),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[passkeys] Failed to fetch status', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

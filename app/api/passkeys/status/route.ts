import { PASSKEY_CSTORE_HKEY } from '@/lib/constants';
import type { PasskeyRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';
import { getAddress } from 'viem';

export const runtime = 'nodejs';

function parsePasskeyRecord(raw: string | null | undefined): PasskeyRecord | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as PasskeyRecord;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.credentialId !== 'string') return null;
    if (typeof parsed.publicKey !== 'string') return null;
    const normalized: PasskeyRecord = {
      credentialId: parsed.credentialId,
      publicKey: parsed.publicKey,
      algorithm: typeof parsed.algorithm === 'number' ? parsed.algorithm : undefined,
      createdAt:
        typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
          ? parsed.createdAt
          : Date.now(),
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
    };
    return normalized;
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
      const existing = await ratio1.cstore.hget({
        hkey: PASSKEY_CSTORE_HKEY,
        key,
      });
      const value =
        typeof existing === 'string'
          ? existing
          : existing && typeof existing === 'object' && 'result' in existing
            ? (existing as { result?: unknown }).result
            : null;
      record = parsePasskeyRecord(typeof value === 'string' ? value : null);
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

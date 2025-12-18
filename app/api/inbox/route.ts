import { RECEIVED_FILES_CSTORE_HKEY } from '@/lib/constants';
import { parseIdentityKey } from '@/lib/identityKey';
import type { StoredUploadRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function parseRecord(raw: string): StoredUploadRecord | null {
  try {
    const parsed = JSON.parse(raw) as StoredUploadRecord;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.cid !== 'string') return null;
    if (typeof parsed.filename !== 'string') return null;
    if (typeof parsed.recipient !== 'string') return null;
    if (typeof parsed.initiator !== 'string') return null;
    if (typeof parsed.txHash !== 'string') return null;
    if (typeof parsed.filesize !== 'number') return null;
    if (typeof parsed.sentAt !== 'number') return null;
    if (typeof parsed.tierId !== 'number') return null;
    if (typeof parsed.usdcAmount !== 'string') return null;
    if (typeof parsed.r1Amount !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const recipient = url.searchParams.get('recipient') ?? url.searchParams.get('identity');

  if (!recipient) {
    return NextResponse.json({ success: false, error: 'Missing identity' }, { status: 400 });
  }
  const identity = parseIdentityKey(recipient);
  if (!identity) {
    return NextResponse.json({ success: false, error: 'Invalid identity' }, { status: 400 });
  }

  try {
    const ratio1 = createEdgeSdk();
    const keysToCheck = [identity.storageKey, ...identity.legacyKeys];
    const mergedEntries: Record<string, string> = {};

    for (const key of keysToCheck) {
      const hkey = `${RECEIVED_FILES_CSTORE_HKEY}_${key}`;
      try {
        const entries = await ratio1.cstore.hgetall({ hkey });
        Object.assign(mergedEntries, entries ?? {});
      } catch (err) {
        console.warn('[inbox] hgetall empty or failed', err);
      }
    }

    const parsedRecords: StoredUploadRecord[] = [];
    for (const raw of Object.values(mergedEntries)) {
      const record = typeof raw === 'string' ? parseRecord(raw) : null;
      if (record) parsedRecords.push(record);
    }

    parsedRecords.sort((a, b) => b.sentAt - a.sentAt);

    return NextResponse.json({ success: true, records: parsedRecords });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[inbox] Failed to list inbox files', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

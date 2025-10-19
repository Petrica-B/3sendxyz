import { SENT_FILES_CSTORE_HKEY } from '@/lib/constants';
import type { StoredUploadRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function parseRecord(raw: string): StoredUploadRecord | null {
  try {
    const parsed = JSON.parse(raw) as StoredUploadRecord;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.filename !== 'string') return null;
    if (typeof parsed.recipient !== 'string') return null;
    if (typeof parsed.initiator !== 'string') return null;
    if (typeof parsed.txHash !== 'string') return null;
    if (typeof parsed.filesize !== 'number') return null;
    if (typeof parsed.sentAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const initiator = url.searchParams.get('initiator');

  if (!initiator) {
    return NextResponse.json({ success: false, error: 'Missing initiator' }, { status: 400 });
  }

  try {
    const ratio1 = createEdgeSdk();
    const initiatorLc = initiator.toLowerCase();
    const hkey = `${SENT_FILES_CSTORE_HKEY}_${initiatorLc}`;
    let allEntries: Record<string, string> = {};
    try {
      const response = await ratio1.cstore.hgetall({
        hkey,
      });
      if (response && typeof response === 'object') {
        allEntries = response as Record<string, string>;
      }
    } catch (err) {
      console.warn('[sent] hgetall empty or failed', err);
      allEntries = {};
    }

    const parsedRecords: StoredUploadRecord[] = [];
    for (const raw of Object.values(allEntries)) {
      const record = typeof raw === 'string' ? parseRecord(raw) : null;
      if (record) parsedRecords.push(record);
    }

    const filtered = parsedRecords.filter((record) => record.initiator === initiatorLc);
    filtered.sort((a, b) => b.sentAt - a.sentAt);

    return NextResponse.json({ success: true, records: filtered });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sent] Failed to list sent files', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

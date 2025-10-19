import { RECEIVED_FILES_CSTORE_HKEY, SENT_FILES_CSTORE_HKEY } from '@/lib/constants';
import type { StoredUploadRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const recipient = formData.get('recipient');
    const initiator = formData.get('initiator');
    const note = formData.get('note');
    const sentAtRaw = formData.get('sentAt');

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'Missing file' }, { status: 400 });
    }

    if (typeof recipient !== 'string' || recipient.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing recipient' }, { status: 400 });
    }

    if (typeof initiator !== 'string' || initiator.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing initiator' }, { status: 400 });
    }

    const ratio1 = createEdgeSdk();
    const recipientKey = recipient.toLowerCase();
    const initiatorAddr = initiator.toLowerCase();
    const sentAt = typeof sentAtRaw === 'string' ? Number(sentAtRaw) : Date.now();
    const sentTimestamp = Number.isFinite(sentAt) ? sentAt : Date.now();
    const noteValue = typeof note === 'string' && note.trim().length > 0 ? note : undefined;
    const txHash = `0x${randomBytes(32).toString('hex')}`;

    const fileBase64 = await file.arrayBuffer();
    const file_base64_str = Buffer.from(fileBase64).toString('base64');
    const uploadResult = await ratio1.r1fs.addFileBase64({
      file_base64_str,
      filename: file.name,
      secret: recipientKey,
    });
    const cid =
      uploadResult && typeof uploadResult === 'object' && 'cid' in uploadResult
        ? (uploadResult as { cid: string }).cid
        : undefined;
    if (!cid) {
      throw new Error('Failed to store file in R1FS');
    }

    const record: StoredUploadRecord = {
      cid,
      filename: file.name,
      recipient: recipientKey,
      initiator: initiatorAddr,
      note: noteValue,
      txHash,
      filesize: file.size,
      sentAt: sentTimestamp,
    };

    await ratio1.cstore.hset({
      hkey: `${RECEIVED_FILES_CSTORE_HKEY}_${recipientKey}`,
      key: txHash,
      value: JSON.stringify(record),
    });
    await ratio1.cstore.hset({
      hkey: `${SENT_FILES_CSTORE_HKEY}_${initiatorAddr}`,
      key: txHash,
      value: JSON.stringify(record),
    });

    return NextResponse.json({
      success: true,
      recordKey: recipientKey,
      record,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[upload] Failed to process upload', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

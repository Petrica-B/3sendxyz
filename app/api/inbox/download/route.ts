import { jsonWithServer } from '@/lib/api';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type DownloadRequest = {
  cid?: string;
  recipient?: string;
  filename?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DownloadRequest;
    const { cid, recipient, filename } = body ?? {};

    if (!cid || typeof cid !== 'string') {
      return jsonWithServer({ success: false, error: 'Missing cid' }, { status: 400 });
    }
    if (!recipient || typeof recipient !== 'string') {
      return jsonWithServer({ success: false, error: 'Missing recipient' }, { status: 400 });
    }

    const ratio1 = createEdgeSdk();
    const recipientKey = recipient.toLowerCase();

    const downloadResult = await ratio1.r1fs.getFile({
      cid,
      secret: recipientKey,
    });

    if (!downloadResult) {
      throw new Error('Missing file data from R1FS');
    }

    return new NextResponse(downloadResult.file_data, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${downloadResult.filename || 'file'}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[inbox-download] Failed to download file', error);
    return jsonWithServer({ success: false, error: message }, { status: 500 });
  }
}

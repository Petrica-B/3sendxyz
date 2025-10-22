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
      return NextResponse.json({ success: false, error: 'Missing cid' }, { status: 400 });
    }
    if (!recipient || typeof recipient !== 'string') {
      return NextResponse.json({ success: false, error: 'Missing recipient' }, { status: 400 });
    }

    const ratio1 = createEdgeSdk();
    const recipientKey = recipient.toLowerCase();

    const downloadResult = await ratio1.r1fs.getFileBase64({
      cid,
      secret: recipientKey,
    });

    const fileBase64 = downloadResult?.file_base64_str;
    const fileName = downloadResult?.filename ?? filename ?? `${cid}.bin`;

    if (!fileBase64) {
      throw new Error('Missing file data from R1FS');
    }

    return NextResponse.json({
      success: true,
      file: {
        base64: fileBase64,
        filename: fileName,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[inbox-download] Failed to download file', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

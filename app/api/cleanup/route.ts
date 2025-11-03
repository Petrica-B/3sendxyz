import { runFileCleanup } from '@/lib/cleanup';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isAuthorized(request: Request) {
  const token = process.env.FILE_CLEANUP_TOKEN;
  if (!token) {
    return true;
  }
  const header = request.headers.get('authorization');
  if (!header) {
    return false;
  }
  const [scheme, value] = header.split(' ');
  return scheme.toLowerCase() === 'bearer' && value === token;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runFileCleanup();
    return NextResponse.json({ success: true, processed: result.processed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cleanup] API-triggered run failed', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

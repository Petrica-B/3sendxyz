import { runFileCleanup } from '@/lib/cleanup';
import { jsonWithServer } from '@/lib/api';

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
    return jsonWithServer({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runFileCleanup();
    return jsonWithServer({
      success: true,
      processed: result.processed,
      deleted: result.deleted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cleanup] API-triggered run failed', error);
    return jsonWithServer({ success: false, error: message }, { status: 500 });
  }
}

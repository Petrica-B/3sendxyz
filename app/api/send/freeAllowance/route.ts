import { getFreeSendAllowance } from '@/lib/freeSends';
import { jsonWithServer } from '@/lib/api';
import { isAddress } from 'viem';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');

  if (!address || !isAddress(address)) {
    return jsonWithServer({ success: false, error: 'Invalid address' }, { status: 400 });
  }

  try {
    const allowance = await getFreeSendAllowance(address);
    return jsonWithServer({ success: true, allowance });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[freeAllowance] Failed to fetch allowance', error);
    return jsonWithServer({ success: false, error: message }, { status: 500 });
  }
}

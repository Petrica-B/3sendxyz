import { getFreeSendAllowance } from '@/lib/freeSends';
import { NextResponse } from 'next/server';
import { isAddress } from 'viem';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');

  if (!address || !isAddress(address)) {
    return NextResponse.json({ success: false, error: 'Invalid address' }, { status: 400 });
  }

  try {
    const allowance = await getFreeSendAllowance(address);
    return NextResponse.json({ success: true, allowance });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[freeAllowance] Failed to fetch allowance', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

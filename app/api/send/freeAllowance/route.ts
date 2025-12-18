import { getFreeSendAllowance } from '@/lib/freeSends';
import { parseIdentityKey } from '@/lib/identityKey';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identityInput = url.searchParams.get('identity') ?? url.searchParams.get('address');

  if (!identityInput) {
    return NextResponse.json({ success: false, error: 'Missing identity' }, { status: 400 });
  }
  const identity = parseIdentityKey(identityInput);
  if (!identity) {
    return NextResponse.json({ success: false, error: 'Invalid identity' }, { status: 400 });
  }

  try {
    const allowance = await getFreeSendAllowance(identity.storageKey);
    return NextResponse.json({ success: true, allowance });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[freeAllowance] Failed to fetch allowance', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

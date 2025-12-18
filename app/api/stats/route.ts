import { fetchAddressStats, fetchPlatformStats } from '@/lib/stats';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const identity = url.searchParams.get('identity') ?? url.searchParams.get('address');

  try {
    const ratio1 = createEdgeSdk();
    const [totals, addressStats] = await Promise.all([
      fetchPlatformStats(ratio1),
      identity ? fetchAddressStats(identity, ratio1) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      totals,
      identity: addressStats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[stats] Failed to read stats', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

import { VAULT_CSTORE_HKEY } from '@/lib/constants';
import { createVaultRecord, decryptPrivateKey, getVaultPrivateKeySecret, parseVaultRecord } from '@/lib/vault';
import { buildVaultAccessMessage } from '@/lib/vaultAccess';
import type { VaultKeyRecord } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';
import { getAddress, isHex, recoverMessageAddress } from 'viem';

export const runtime = 'nodejs';

interface PrivateKeyRequest {
  address?: string;
  signature?: string;
  message?: string;
}

function normalizeAddress(input: string): string | null {
  try {
    return getAddress(input);
  } catch {
    return null;
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export async function POST(request: Request) {
  let body: PrivateKeyRequest;

  try {
    body = (await request.json()) as PrivateKeyRequest;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { address, signature, message } = body;

  if (!isString(address) || address.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
  }

  if (!isString(signature) || signature.trim().length === 0 || !isHex(signature)) {
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 });
  }

  if (!isString(message) || message.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing message' }, { status: 400 });
  }

  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    return NextResponse.json({ success: false, error: 'Invalid address' }, { status: 400 });
  }

  const expectedMessage = buildVaultAccessMessage(normalizedAddress);
  if (message !== expectedMessage) {
    return NextResponse.json({ success: false, error: 'Unexpected message' }, { status: 400 });
  }

  try {
    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    if (getAddress(recovered) !== normalizedAddress) {
      return NextResponse.json({ success: false, error: 'Signature does not match address' }, { status: 401 });
    }
  } catch (error) {
    console.warn('[vault] Failed to recover address from signature', error);
    return NextResponse.json({ success: false, error: 'Failed to validate signature' }, { status: 400 });
  }

  try {
    const ratio1 = createEdgeSdk();
    const addressKey = normalizedAddress.toLowerCase();
    const secret = getVaultPrivateKeySecret();

    let record: VaultKeyRecord | null = null;

    try {
      const existing = await ratio1.cstore.hget({
        hkey: VAULT_CSTORE_HKEY,
        key: addressKey,
      });
      const existingValue =
        typeof existing === 'string'
          ? existing
          : existing && typeof existing === 'object' && 'result' in existing
            ? (existing as { result?: unknown }).result
            : null;
      record = parseVaultRecord(typeof existingValue === 'string' ? existingValue : null);
    } catch (error) {
      console.warn('[vault] hget failed', error);
    }

    if (!record) {
      record = createVaultRecord(secret);
      await ratio1.cstore.hset({
        hkey: VAULT_CSTORE_HKEY,
        key: addressKey,
        value: JSON.stringify(record),
      });
    }

    const privateKey = decryptPrivateKey(record.privateKey, secret).toString('base64');

    return NextResponse.json({
      success: true,
      type: 'vault',
      publicKey: record.publicKey,
      privateKey,
      createdAt: record.createdAt,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    console.error('[vault] Failed to resolve private key', error);
    return NextResponse.json({ success: false, error: messageText }, { status: 500 });
  }
}

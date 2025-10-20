import { PASSKEY_CSTORE_HKEY, VAULT_CSTORE_HKEY } from '@/lib/constants';
import { buildPasskeyRegisterMessage } from '@/lib/passkeyAccess';
import type { PasskeyRecord } from '@/lib/types';
import { parseVaultRecord } from '@/lib/vault';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { getAddress, isHex, recoverMessageAddress } from 'viem';

export const runtime = 'nodejs';

type RegisterBody = {
  address?: string;
  signature?: string;
  message?: string;
  credentialId?: string;
  publicKey?: string;
  algorithm?: number;
  label?: string;
};

function isBase64(input: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(input);
}

export async function POST(request: Request) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { address, signature, message, credentialId, publicKey, algorithm, label } = body ?? {};
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing address' }, { status: 400 });
  }
  if (!signature || typeof signature !== 'string' || signature.trim().length === 0 || !isHex(signature)) {
    return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 });
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing message' }, { status: 400 });
  }
  if (!credentialId || typeof credentialId !== 'string' || credentialId.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing credentialId' }, { status: 400 });
  }
  if (!publicKey || typeof publicKey !== 'string' || publicKey.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'Missing publicKey' }, { status: 400 });
  }

  let normalized: string;
  try {
    normalized = getAddress(address);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid address' }, { status: 400 });
  }

  const expectedMessage = buildPasskeyRegisterMessage(normalized);
  if (message !== expectedMessage) {
    return NextResponse.json({ success: false, error: 'Unexpected message' }, { status: 400 });
  }

  try {
    const recovered = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    if (getAddress(recovered) !== normalized) {
      return NextResponse.json({ success: false, error: 'Signature does not match address' }, { status: 401 });
    }
  } catch (error) {
    console.warn('[passkeys] Failed to recover address from signature', error);
    return NextResponse.json({ success: false, error: 'Failed to validate signature' }, { status: 400 });
  }

  if (!isBase64(credentialId)) {
    return NextResponse.json({ success: false, error: 'credentialId must be base64 encoded' }, { status: 400 });
  }
  if (!isBase64(publicKey)) {
    return NextResponse.json({ success: false, error: 'publicKey must be base64 encoded' }, { status: 400 });
  }

  let credentialIdBuf: Buffer;
  let publicKeyBuf: Buffer;
  try {
    credentialIdBuf = Buffer.from(credentialId, 'base64');
    publicKeyBuf = Buffer.from(publicKey, 'base64');
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to decode credential payload' }, { status: 400 });
  }

  if (credentialIdBuf.length === 0) {
    return NextResponse.json({ success: false, error: 'credentialId is empty' }, { status: 400 });
  }
  if (publicKeyBuf.length === 0) {
    return NextResponse.json({ success: false, error: 'publicKey is empty' }, { status: 400 });
  }

  const record: PasskeyRecord = {
    credentialId,
    publicKey,
    algorithm: typeof algorithm === 'number' && Number.isInteger(algorithm) ? algorithm : undefined,
    createdAt: Date.now(),
    label: typeof label === 'string' && label.trim().length > 0 ? label.trim().slice(0, 30) : undefined,
  };

  try {
    const ratio1 = createEdgeSdk();
    const key = normalized.toLowerCase();
    await ratio1.cstore.hset({
      hkey: PASSKEY_CSTORE_HKEY,
      key,
      value: JSON.stringify(record),
    });

    try {
      const existingVault = await ratio1.cstore.hget({
        hkey: VAULT_CSTORE_HKEY,
        key,
      });
      const vaultValue =
        typeof existingVault === 'string'
          ? existingVault
          : existingVault && typeof existingVault === 'object' && 'result' in existingVault
            ? (existingVault as { result?: unknown }).result
            : null;
      const parsedVault = parseVaultRecord(typeof vaultValue === 'string' ? vaultValue : null);
      if (parsedVault) {
        const nextVault = {
          ...parsedVault,
          passkeyPublicKey: publicKey,
          passkeyCredentialId: credentialId,
        };
        await ratio1.cstore.hset({
          hkey: VAULT_CSTORE_HKEY,
          key,
          value: JSON.stringify(nextVault),
        });
      }
    } catch (error) {
      console.warn('[passkeys] Failed to update vault record', error);
    }

    return NextResponse.json({
      success: true,
      address: normalized,
      record,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    console.error('[passkeys] Failed to store record', error);
    return NextResponse.json({ success: false, error: messageText }, { status: 500 });
  }
}

import { REGISTERED_KEYS_CSTORE_HKEY } from '@/lib/constants';
import { getClerkIdentityKey } from '@/lib/clerkIdentity';
import { parseIdentityKey } from '@/lib/identityKey';
import { buildRegisteredKeyMessage } from '@/lib/keyAccess';
import type {
  RegisteredKeyRecord,
  RegisteredPasskeyRecord,
  RegisteredSeedRecord,
} from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { NextResponse } from 'next/server';
import { Buffer } from 'node:buffer';
import { getAddress, isHex, recoverMessageAddress } from 'viem';

export const runtime = 'nodejs';

type RegisterBody = {
  address?: string;
  identity?: string;
  signature?: string;
  message?: string;
  type?: string;
  credentialId?: string;
  publicKey?: string;
  passkeyPublicKey?: string;
  seedPublicKey?: string;
  algorithm?: number;
  label?: string;
  prfSalt?: string;
  x25519PublicKey?: string;
  fingerprint?: string;
  derivationPath?: string;
};

function isBase64(input: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(input);
}

function sanitizeLabel(label: unknown): string | undefined {
  if (typeof label !== 'string') return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 30);
}

function sanitizeOptionalField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

export async function POST(request: Request) {
  let body: RegisterBody;
  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    address,
    identity,
    signature,
    message,
    type,
    credentialId,
    publicKey,
    passkeyPublicKey,
    seedPublicKey,
    x25519PublicKey,
    algorithm,
    label,
    prfSalt,
    fingerprint,
    derivationPath,
  } = body ?? {};
  const rawIdentity = typeof identity === 'string' && identity.trim().length > 0 ? identity : address;
  const parsedIdentity = rawIdentity ? parseIdentityKey(rawIdentity) : null;
  const clerkIdentity = await getClerkIdentityKey();
  const walletIdentity = parsedIdentity?.kind === 'wallet' ? parsedIdentity : null;
  const emailIdentity = parsedIdentity?.kind === 'email' ? parsedIdentity : null;

  if (walletIdentity) {
    if (
      !signature ||
      typeof signature !== 'string' ||
      signature.trim().length === 0 ||
      !isHex(signature)
    ) {
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing message' }, { status: 400 });
    }
  } else if (clerkIdentity) {
    if (emailIdentity && emailIdentity.value !== clerkIdentity.value) {
      return NextResponse.json({ success: false, error: 'Identity mismatch' }, { status: 403 });
    }
  } else {
    return NextResponse.json({ success: false, error: 'Missing identity' }, { status: 400 });
  }

  const normalizedType = typeof type === 'string' ? type.toLowerCase().trim() : '';
  const keyType: 'passkey' | 'seed' = normalizedType === 'seed' ? 'seed' : 'passkey';

  const resolvedIdentity = walletIdentity ?? emailIdentity ?? clerkIdentity;
  if (!resolvedIdentity) {
    return NextResponse.json({ success: false, error: 'Missing identity' }, { status: 400 });
  }
  let normalizedAddress: string | null = null;
  if (resolvedIdentity.kind === 'wallet') {
    try {
      normalizedAddress = getAddress(resolvedIdentity.value);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid address' }, { status: 400 });
    }
  }

  const labelValue = sanitizeLabel(label);
  let keyPublicBase64: string | null = null;
  let record: RegisteredKeyRecord;

  if (keyType === 'passkey') {
    if (!credentialId || typeof credentialId !== 'string' || credentialId.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing credentialId' }, { status: 400 });
    }
    const keyPublicCandidate =
      typeof passkeyPublicKey === 'string' && passkeyPublicKey.trim().length > 0
        ? passkeyPublicKey
        : typeof x25519PublicKey === 'string' && x25519PublicKey.trim().length > 0
          ? x25519PublicKey
          : typeof publicKey === 'string' && publicKey.trim().length > 0
            ? publicKey
            : null;

    if (!keyPublicCandidate) {
      return NextResponse.json(
        { success: false, error: 'Missing passkey public key' },
        { status: 400 }
      );
    }

    const normalizedKey = keyPublicCandidate.trim();

    if (!prfSalt || typeof prfSalt !== 'string' || prfSalt.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Missing prfSalt' }, { status: 400 });
    }

    if (!isBase64(credentialId)) {
      return NextResponse.json(
        { success: false, error: 'credentialId must be base64 encoded' },
        { status: 400 }
      );
    }
    if (!isBase64(normalizedKey)) {
      return NextResponse.json(
        { success: false, error: 'passkey public key must be base64 encoded' },
        { status: 400 }
      );
    }
    if (!isBase64(prfSalt)) {
      return NextResponse.json(
        { success: false, error: 'prfSalt must be base64 encoded' },
        { status: 400 }
      );
    }

    let credentialIdBuf: Buffer;
    let publicKeyBuf: Buffer;
    let prfSaltBuf: Buffer;
    try {
      credentialIdBuf = Buffer.from(credentialId, 'base64');
      publicKeyBuf = Buffer.from(normalizedKey, 'base64');
      prfSaltBuf = Buffer.from(prfSalt, 'base64');
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to decode credential payload' },
        { status: 400 }
      );
    }

    if (credentialIdBuf.length === 0) {
      return NextResponse.json({ success: false, error: 'credentialId is empty' }, { status: 400 });
    }
    if (publicKeyBuf.length === 0) {
      return NextResponse.json({ success: false, error: 'publicKey is empty' }, { status: 400 });
    }
    if (prfSaltBuf.length === 0) {
      return NextResponse.json({ success: false, error: 'prfSalt is empty' }, { status: 400 });
    }

    keyPublicBase64 = normalizedKey;

    const passkeyRecord: RegisteredPasskeyRecord = {
      type: 'passkey',
      credentialId,
      publicKey: normalizedKey,
      algorithm:
        typeof algorithm === 'number' && Number.isInteger(algorithm) ? algorithm : undefined,
      createdAt: Date.now(),
      label: labelValue,
      prfSalt,
    };
    record = passkeyRecord;
  } else {
    const keyPublicCandidate =
      typeof seedPublicKey === 'string' && seedPublicKey.trim().length > 0
        ? seedPublicKey
        : typeof x25519PublicKey === 'string' && x25519PublicKey.trim().length > 0
          ? x25519PublicKey
          : typeof publicKey === 'string' && publicKey.trim().length > 0
            ? publicKey
            : null;

    if (!keyPublicCandidate) {
      return NextResponse.json(
        { success: false, error: 'Missing seed public key' },
        { status: 400 }
      );
    }

    const normalizedKey = keyPublicCandidate.trim();

    if (!isBase64(normalizedKey)) {
      return NextResponse.json(
        { success: false, error: 'seed public key must be base64 encoded' },
        { status: 400 }
      );
    }

    let publicKeyBuf: Buffer;
    try {
      publicKeyBuf = Buffer.from(normalizedKey, 'base64');
    } catch {
      return NextResponse.json(
        { success: false, error: 'Failed to decode seed public key' },
        { status: 400 }
      );
    }

    if (publicKeyBuf.length === 0) {
      return NextResponse.json({ success: false, error: 'publicKey is empty' }, { status: 400 });
    }

    keyPublicBase64 = normalizedKey;

    const seedRecord: RegisteredSeedRecord = {
      type: 'seed',
      publicKey: normalizedKey,
      createdAt: Date.now(),
      label: labelValue,
      fingerprint: sanitizeOptionalField(fingerprint, 64),
      derivationPath: sanitizeOptionalField(derivationPath, 80),
    };
    record = seedRecord;
  }

  if (!keyPublicBase64) {
    return NextResponse.json(
      { success: false, error: 'Missing public key' },
      { status: 400 }
    );
  }

  if (normalizedAddress) {
    const expectedMessage = buildRegisteredKeyMessage(normalizedAddress, keyPublicBase64);
    if (message !== expectedMessage) {
      return NextResponse.json({ success: false, error: 'Unexpected message' }, { status: 400 });
    }

    try {
      const recovered = await recoverMessageAddress({
        message: message as string,
        signature: signature as `0x${string}`,
      });
      if (getAddress(recovered) !== normalizedAddress) {
        return NextResponse.json(
          { success: false, error: 'Signature does not match address' },
          { status: 401 }
        );
      }
    } catch (error) {
      console.warn('[passkeys] Failed to recover address from signature', error);
      return NextResponse.json(
        { success: false, error: 'Failed to validate signature' },
        { status: 400 }
      );
    }
  }

  try {
    const ratio1 = createEdgeSdk();
    await ratio1.cstore.hset({
      hkey: REGISTERED_KEYS_CSTORE_HKEY,
      key: resolvedIdentity.storageKey,
      value: JSON.stringify(record),
    });

    return NextResponse.json({
      success: true,
      identity: resolvedIdentity.value,
      identityKey: resolvedIdentity.storageKey,
      record,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    console.error('[keys] Failed to store record', error);
    return NextResponse.json({ success: false, error: messageText }, { status: 500 });
  }
}

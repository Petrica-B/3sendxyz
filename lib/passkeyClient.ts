import { decodeBase64, encodeBase64 } from '@/lib/encryption';
import { x25519 } from '@noble/curves/ed25519';

const HKDF_INFO = '3send:x25519:sk:v1';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function clampScalar(scalar: Uint8Array): void {
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
}

async function hkdfSha256(prfBytes: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const hkdfKey = await crypto.subtle.importKey('raw', toArrayBuffer(prfBytes), 'HKDF', false, [
    'deriveBits',
  ]);
  const info = new TextEncoder().encode(HKDF_INFO);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info,
    },
    hkdfKey,
    256
  );
  return new Uint8Array(derivedBits);
}

export async function evaluatePasskeyPrf(credentialIdB64: string, salt: Uint8Array): Promise<Uint8Array> {
  if (typeof window === 'undefined') {
    throw new Error('Passkey PRF available only in browser environment');
  }
  if (!window.PublicKeyCredential || !navigator.credentials?.get) {
    throw new Error('Passkeys are not supported in this browser');
  }

  const credentialIdBytes = decodeBase64(credentialIdB64);
  const credentialIdBuffer = toArrayBuffer(credentialIdBytes);

  const saltBuffer = toArrayBuffer(salt);
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertions = (await navigator.credentials.get({
    publicKey: {
      challenge: toArrayBuffer(challenge),
      timeout: 60_000,
      userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: credentialIdBuffer }],
      extensions: {
        prf: {
          eval: {
            first: saltBuffer,
          },
        },
      },
    },
  })) as PublicKeyCredential | null;

  if (!assertions) {
    throw new Error('Passkey PRF request was cancelled');
  }

  const extensionResults = assertions.getClientExtensionResults?.();
  const prfResult =
    extensionResults && typeof extensionResults === 'object'
      ? (extensionResults as { prf?: { results?: { first?: unknown } } }).prf?.results?.first
      : null;

  if (!prfResult) {
    throw new Error('Passkey PRF result missing');
  }

  let buffer: ArrayBuffer | null = null;
  if (prfResult instanceof ArrayBuffer) {
    buffer = prfResult;
  } else if (prfResult && typeof prfResult === 'object' && 'buffer' in prfResult) {
    const maybeBuffer = (prfResult as { buffer?: unknown }).buffer;
    buffer = maybeBuffer instanceof ArrayBuffer ? maybeBuffer : null;
  }
  if (!buffer) {
    throw new Error('Unexpected PRF result format');
  }

  return new Uint8Array(buffer.slice(0));
}

export async function derivePasskeyX25519KeyPair(params: {
  credentialIdB64: string;
  salt: Uint8Array;
}): Promise<{ privateKey: Uint8Array; publicKey: string }> {
  const { credentialIdB64, salt } = params;
  const prfBytes = await evaluatePasskeyPrf(credentialIdB64, salt);
  const scalar = await hkdfSha256(prfBytes, salt);
  clampScalar(scalar);
  const publicKeyBytes = x25519.getPublicKey(scalar);
  return {
    privateKey: scalar,
    publicKey: encodeBase64(publicKeyBytes),
  };
}

export function randomPrfSalt(length = 32): Uint8Array {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

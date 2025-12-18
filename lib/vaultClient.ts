import { decodeBase64 } from '@/lib/encryption';
import { parseIdentityKey } from '@/lib/identityKey';
import { buildVaultAccessMessage } from '@/lib/vaultAccess';

type SignMessageArgs = { message: string };
type SignMessageFn = (args: SignMessageArgs) => Promise<string>;

const privateKeyCache = new Map<string, Uint8Array>();

async function requestVaultPrivateKey(params: {
  identity: string;
  signature?: string;
  message?: string;
}): Promise<Uint8Array> {
  const response = await fetch('/api/vault/getPrivateKey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: params.identity,
      signature: params.signature,
      message: params.message,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'Failed to fetch vault private key');
  }
  const privateKeyBase64 = payload.privateKey;
  if (typeof privateKeyBase64 !== 'string' || privateKeyBase64.trim().length === 0) {
    throw new Error('Vault response missing private key');
  }
  const privateKeyBytes = decodeBase64(privateKeyBase64);
  if (privateKeyBytes.length !== 32) {
    throw new Error('Vault private key must be 32 bytes');
  }
  return privateKeyBytes;
}

export async function getVaultPrivateKey(
  identity: string,
  signMessage?: SignMessageFn
): Promise<Uint8Array> {
  const parsedIdentity = parseIdentityKey(identity);
  if (!parsedIdentity) {
    throw new Error('Invalid identity');
  }
  const cacheKey = parsedIdentity.storageKey;
  const cached = privateKeyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let message: string | undefined;
  let signature: string | undefined;
  if (parsedIdentity.kind === 'wallet') {
    if (!signMessage) {
      throw new Error('Wallet signature required to access vault key');
    }
    message = buildVaultAccessMessage(parsedIdentity.value);
    signature = await signMessage({ message });
  }

  const privateKey = await requestVaultPrivateKey({
    identity: parsedIdentity.value,
    signature,
    message,
  });
  privateKeyCache.set(cacheKey, privateKey);
  return privateKey;
}

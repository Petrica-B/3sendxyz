import { decodeBase64 } from '@/lib/encryption';
import { buildVaultAccessMessage } from '@/lib/vaultAccess';

type SignMessageArgs = { message: string };
type SignMessageFn = (args: SignMessageArgs) => Promise<string>;

const privateKeyCache = new Map<string, Uint8Array>();

async function requestVaultPrivateKey(
  address: string,
  signature: string,
  message: string
): Promise<Uint8Array> {
  const response = await fetch('/api/vault/getPrivateKey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature, message }),
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
  address: string,
  signMessage: SignMessageFn
): Promise<Uint8Array> {
  const cacheKey = address.toLowerCase();
  const cached = privateKeyCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const message = buildVaultAccessMessage(address);
  const signature = await signMessage({ message });
  const privateKey = await requestVaultPrivateKey(address, signature, message);
  privateKeyCache.set(cacheKey, privateKey);
  return privateKey;
}

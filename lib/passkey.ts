import type {
  RegisteredKeyRecord,
  RegisteredPasskeyRecord,
  RegisteredSeedRecord,
} from '@/lib/types';

function sanitizeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 30);
}

// Normalizes a JSON-stored registered key record; returns null when the payload is invalid.
export function parseRegisteredKeyRecord(
  raw: string | null | undefined
): RegisteredKeyRecord | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RegisteredKeyRecord> & Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;

    const publicKey =
      typeof parsed.publicKey === 'string'
        ? parsed.publicKey
        : typeof (parsed as { passkeyPublicKey?: unknown }).passkeyPublicKey === 'string'
          ? ((parsed as { passkeyPublicKey?: string }).passkeyPublicKey as string)
          : null;
    if (!publicKey) return null;

    const createdAt =
      typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
        ? parsed.createdAt
        : Date.now();
    const base = {
      publicKey,
      createdAt,
      label: sanitizeLabel(parsed.label),
    };

    const rawType =
      typeof parsed.type === 'string'
        ? (parsed.type as string).toLowerCase()
        : typeof (parsed as { keyType?: unknown }).keyType === 'string'
          ? ((parsed as { keyType?: string }).keyType as string).toLowerCase()
          : '';

    const type: 'passkey' | 'seed' = rawType === 'seed' ? 'seed' : 'passkey';

    if (type === 'passkey') {
      const credentialId =
        typeof (parsed as { credentialId?: unknown }).credentialId === 'string'
          ? ((parsed as { credentialId?: string }).credentialId as string)
          : null;
      const prfSalt =
        typeof (parsed as { prfSalt?: unknown }).prfSalt === 'string'
          ? ((parsed as { prfSalt?: string }).prfSalt as string)
          : null;
      if (!credentialId || !prfSalt) return null;
      const passkeyRecord: RegisteredPasskeyRecord = {
        type: 'passkey',
        ...base,
        credentialId,
        prfSalt,
        algorithm:
          typeof (parsed as { algorithm?: unknown }).algorithm === 'number'
            ? ((parsed as { algorithm?: number }).algorithm as number)
            : undefined,
      };
      return passkeyRecord;
    }

    const fingerprint =
      typeof (parsed as { fingerprint?: unknown }).fingerprint === 'string'
        ? ((parsed as { fingerprint?: string }).fingerprint as string)
        : typeof (parsed as { seedFingerprint?: unknown }).seedFingerprint === 'string'
          ? ((parsed as { seedFingerprint?: string }).seedFingerprint as string)
          : undefined;
    const derivationPath =
      typeof (parsed as { derivationPath?: unknown }).derivationPath === 'string'
        ? ((parsed as { derivationPath?: string }).derivationPath as string)
        : undefined;
    const seedRecord: RegisteredSeedRecord = {
      type: 'seed',
      ...base,
      fingerprint,
      derivationPath,
    };
    return seedRecord;
  } catch {
    return null;
  }
}

// Maintains compatibility for legacy consumers expecting only passkey records.
export function parsePasskeyRecord(
  raw: string | null | undefined
): RegisteredPasskeyRecord | null {
  const record = parseRegisteredKeyRecord(raw);
  if (!record || record.type !== 'passkey') return null;
  return record;
}

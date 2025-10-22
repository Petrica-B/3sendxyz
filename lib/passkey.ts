import type { PasskeyRecord } from '@/lib/types';

// Normalizes a JSON-stored passkey record; returns null when the payload is invalid.
export function parsePasskeyRecord(raw: string | null | undefined): PasskeyRecord | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as PasskeyRecord;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.credentialId !== 'string') return null;
    if (typeof parsed.publicKey !== 'string') return null;
    const prfSalt = typeof parsed.prfSalt === 'string' ? parsed.prfSalt : '';
    return {
      credentialId: parsed.credentialId,
      publicKey: parsed.publicKey,
      algorithm: typeof parsed.algorithm === 'number' ? parsed.algorithm : undefined,
      createdAt:
        typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
          ? parsed.createdAt
          : Date.now(),
      label: typeof parsed.label === 'string' ? parsed.label : undefined,
      prfSalt,
    };
  } catch {
    return null;
  }
}

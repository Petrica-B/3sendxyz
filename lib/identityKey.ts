import { getAddress, isAddress } from 'viem';

export const EMAIL_IDENTITY_PREFIX = 'email:';
export const WALLET_IDENTITY_PREFIX = 'addr:';

export type IdentityKind = 'wallet' | 'email';

export type IdentityKey = {
  kind: IdentityKind;
  value: string;
  storageKey: string;
  legacyKeys: string[];
};

const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function normalizeEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return emailRegex.test(trimmed) ? trimmed : null;
}

function normalizeWalletAddress(value: string): string | null {
  try {
    const normalized = getAddress(value);
    return normalized.toLowerCase();
  } catch {
    return null;
  }
}

export function isEmailIdentity(value: string): boolean {
  return normalizeEmail(value) !== null;
}

export function parseIdentityKey(input: string): IdentityKey | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.toLowerCase().startsWith(EMAIL_IDENTITY_PREFIX)) {
    const raw = trimmed.slice(EMAIL_IDENTITY_PREFIX.length);
    const normalized = normalizeEmail(raw);
    if (!normalized) return null;
    return {
      kind: 'email',
      value: normalized,
      storageKey: `${EMAIL_IDENTITY_PREFIX}${normalized}`,
      legacyKeys: [normalized],
    };
  }

  if (trimmed.toLowerCase().startsWith(WALLET_IDENTITY_PREFIX)) {
    const raw = trimmed.slice(WALLET_IDENTITY_PREFIX.length);
    const normalized = normalizeWalletAddress(raw);
    if (!normalized) return null;
    return {
      kind: 'wallet',
      value: normalized,
      storageKey: `${WALLET_IDENTITY_PREFIX}${normalized}`,
      legacyKeys: [normalized],
    };
  }

  const normalizedEmail = normalizeEmail(trimmed);
  if (normalizedEmail) {
    return {
      kind: 'email',
      value: normalizedEmail,
      storageKey: `${EMAIL_IDENTITY_PREFIX}${normalizedEmail}`,
      legacyKeys: [normalizedEmail],
    };
  }

  if (isAddress(trimmed)) {
    const normalized = normalizeWalletAddress(trimmed);
    if (!normalized) return null;
    return {
      kind: 'wallet',
      value: normalized,
      storageKey: `${WALLET_IDENTITY_PREFIX}${normalized}`,
      legacyKeys: [normalized],
    };
  }

  return null;
}

import { TierConfig } from './types';

export const VAULT_ACCESS_MESSAGE_PREFIX = '3send vault private key access for';
export const PASSKEY_REGISTER_MESSAGE_PREFIX = '3send passkey register for';
export const VAULT_PRIVATE_KEY_MIN_SECRET_LENGTH = 32;

export const RECEIVED_FILES_CSTORE_HKEY = '3sendxyz_received_files';
export const SENT_FILES_CSTORE_HKEY = '3sendxyz_sent_files';
export const VAULT_CSTORE_HKEY = '3sendxyz_vault';
export const PASSKEY_CSTORE_HKEY = '3sendxyz_passkeys';

export const MANAGER_CONTRACT_ADDRESS =
  '0x3adD1000920ef08D902fCc9de8053fdcaF708c9E' as `0x${string}`;
export const R1_CONTRACT_ADDRESS = '0x277CbD0Cf25F4789Bc04035eCd03d811FAf73691' as `0x${string}`;

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const TIER_CONFIG: TierConfig[] = [
  {
    id: 0,
    label: '⚡ Micro Send — $0.10 burn — < 50 MB',
    description: 'Best for quick transfers up to 50 MB.',
    minBytes: 0,
    maxBytes: 50 * MB - 1,
    usd: 0.1,
  },
  {
    id: 1,
    label: '📁 Standard Send — $0.25 burn — 50-500 MB',
    description: 'Recommended for documents and medium files.',
    minBytes: 50 * MB,
    maxBytes: 500 * MB - 1,
    usd: 0.25,
  },
  {
    id: 2,
    label: '🎬 Big Send — $0.75 burn — 0.5-2 GB',
    description: 'Great for large media or project bundles.',
    minBytes: 500 * MB,
    maxBytes: 2 * GB - 1,
    usd: 0.75,
  },
  {
    id: 3,
    label: '🗄️ Archive Send — $2.00 burn — 2-5 GB',
    description: 'For archives and heavy payloads up to 5 GB.',
    minBytes: 2 * GB,
    maxBytes: 5 * GB,
    usd: 2,
  },
];

export const MAX_FILE_BYTES = TIER_CONFIG[TIER_CONFIG.length - 1]?.maxBytes ?? 0;

export function resolveTierBySize(bytes: number): TierConfig | null {
  for (const tier of TIER_CONFIG) {
    if (bytes >= tier.minBytes && bytes <= tier.maxBytes) {
      return tier;
    }
  }
  return null;
}

export function getTierById(id: number): TierConfig | undefined {
  return TIER_CONFIG.find((tier) => tier.id === id);
}

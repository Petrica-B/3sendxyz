import type { Chain } from 'viem/chains';
import { base } from 'viem/chains';

import { TierConfig } from './types';

export const VAULT_ACCESS_MESSAGE_PREFIX = '3send vault private key access for';
export const REGISTERED_KEY_MESSAGE_PREFIX = '3send key register for';
export const VAULT_PRIVATE_KEY_MIN_SECRET_LENGTH = 32;

export const RECEIVED_FILES_CSTORE_HKEY = '3sendxyz_received_files';
export const SENT_FILES_CSTORE_HKEY = '3sendxyz_sent_files';
export const USED_PAYMENT_TXS_CSTORE_HKEY = '3sendxyz_payment_txhashes';
export const VAULT_CSTORE_HKEY = '3sendxyz_vault';
export const REGISTERED_KEYS_CSTORE_HKEY = '3sendxyz_register_keys';
export const STATS_CSTORE_HKEY = '3sendxyz_stats';
export const FILE_CLEANUP_INDEX_CSTORE_HKEY = '3sendxyz_file_cleanup_index';
export const FREE_SENDS_CSTORE_HKEY = '3sendxyz_free_sends';
export const FILE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export const SUPPORTED_CHAINS = [base] as const satisfies readonly Chain[];
export const REQUIRED_CHAIN = SUPPORTED_CHAINS[0];
export const REQUIRED_CHAIN_ID = REQUIRED_CHAIN.id;
export const REQUIRED_CHAIN_NAME = REQUIRED_CHAIN.name;
export const SUPPORTED_CHAIN_IDS: ReadonlyArray<number> = SUPPORTED_CHAINS.map((chain) => chain.id);

export const isSupportedChainId = (
  chainId: number | null | undefined
): chainId is (typeof SUPPORTED_CHAIN_IDS)[number] => {
  if (typeof chainId !== 'number') return false;
  return SUPPORTED_CHAIN_IDS.includes(chainId);
};

export const MANAGER_CONTRACT_ADDRESS = '0x6660d6b8eB523cEC00ecc4091174d006De5F7D3B' as const;
export const R1_CONTRACT_ADDRESS = '0x6444C6c2D527D85EA97032da9A7504d6d1448ecF' as const;
export const USDC_CONTRACT_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const WETH_CONTRACT_ADDRESS = '0x4200000000000000000000000000000000000006' as const;

export const FREE_MICRO_SENDS_PER_MONTH = 3;
export const FREE_MICRO_TIER_ID = 0;
export const FREE_PAYMENT_REFERENCE_PREFIX = 'free:';

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const TIER_CONFIG: TierConfig[] = [
  {
    id: 0,
    label: '⚡ Micro Send — $0.05 burn',
    description: 'Best for quick transfers up to 50 MB.',
    minBytes: 0,
    maxBytes: 50 * MB - 1,
    usd: 0.05,
  },
  {
    id: 1,
    label: '📁 Standard Send — $0.10 burn',
    description: 'Recommended for documents and medium files.',
    minBytes: 50 * MB,
    maxBytes: 500 * MB - 1,
    usd: 0.1,
  },
  {
    id: 2,
    label: '🎬 Big Send — $0.40 burn',
    description: 'Great for large media or project bundles.',
    minBytes: 500 * MB,
    maxBytes: 2 * GB - 1,
    usd: 0.4,
  },
  {
    id: 3,
    label: '🗄️ Archive Send — $1.00 burn',
    description: 'For archives and heavy payloads up to 5 GB.',
    minBytes: 2 * GB,
    maxBytes: 5 * GB,
    usd: 1,
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

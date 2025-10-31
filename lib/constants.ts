import type { Chain } from 'viem/chains';
import { baseSepolia } from 'viem/chains';

import { TierConfig } from './types';

export const VAULT_ACCESS_MESSAGE_PREFIX = '3send vault private key access for';
export const REGISTERED_KEY_MESSAGE_PREFIX = '3send key register for';
export const VAULT_PRIVATE_KEY_MIN_SECRET_LENGTH = 32;

export const RECEIVED_FILES_CSTORE_HKEY = '3sendxyz_received_files';
export const SENT_FILES_CSTORE_HKEY = '3sendxyz_sent_files';
export const VAULT_CSTORE_HKEY = '3sendxyz_vault';
export const REGISTERED_KEYS_CSTORE_HKEY = '3sendxyz_register_keys';

export const SUPPORTED_CHAINS = [baseSepolia] as const satisfies readonly Chain[];
export const REQUIRED_CHAIN = SUPPORTED_CHAINS[0];
export const REQUIRED_CHAIN_ID = REQUIRED_CHAIN.id;
export const REQUIRED_CHAIN_NAME = REQUIRED_CHAIN.name;
export const SUPPORTED_CHAIN_IDS: ReadonlyArray<number> = SUPPORTED_CHAINS.map(
  (chain) => chain.id
);

export const isSupportedChainId = (
  chainId: number | null | undefined
): chainId is (typeof SUPPORTED_CHAIN_IDS)[number] => {
  if (typeof chainId !== 'number') return false;
  return SUPPORTED_CHAIN_IDS.includes(chainId);
};

export const MANAGER_CONTRACT_ADDRESS = '0xbFB3524A5F441716C50d5D167B37b1e898abae89' as const;
export const R1_CONTRACT_ADDRESS = '0x277CbD0Cf25F4789Bc04035eCd03d811FAf73691' as const;
export const USDC_CONTRACT_ADDRESS = '0xfD9A4a17D76087f7c94950b67c3A5b7638427ECF' as const;
export const WETH_CONTRACT_ADDRESS = '0x24fe7807089e321395172633aA9c4bBa4Ac4a357' as const;

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

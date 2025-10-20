import { VAULT_ACCESS_MESSAGE_PREFIX } from './constants';
import { getAddress } from 'viem';

export function buildVaultAccessMessage(address: string): string {
  return `${VAULT_ACCESS_MESSAGE_PREFIX} ${getAddress(address)}`;
}

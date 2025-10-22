import { REGISTERED_KEY_MESSAGE_PREFIX } from '@/lib/constants';
import { getAddress } from 'viem';

export function buildRegisteredKeyMessage(address: string): string {
  return `${REGISTERED_KEY_MESSAGE_PREFIX} ${getAddress(address)}`;
}

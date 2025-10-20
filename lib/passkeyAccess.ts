import { PASSKEY_REGISTER_MESSAGE_PREFIX } from '@/lib/constants';
import { getAddress } from 'viem';

export function buildPasskeyRegisterMessage(address: string): string {
  return `${PASSKEY_REGISTER_MESSAGE_PREFIX} ${getAddress(address)}`;
}

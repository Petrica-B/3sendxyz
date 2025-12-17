'use client';

import { useAuth } from '@clerk/nextjs';
import { useAccount } from 'wagmi';

export type AuthMethod = 'none' | 'wallet' | 'clerk' | 'mixed';

export function useAuthStatus() {
  const { isSignedIn } = useAuth();
  const { address, isConnected } = useAccount();
  const hasWallet = Boolean(isConnected && address);
  const hasClerk = Boolean(isSignedIn);
  const authMethod: AuthMethod = hasWallet && hasClerk
    ? 'mixed'
    : hasWallet
      ? 'wallet'
      : hasClerk
        ? 'clerk'
        : 'none';
  const canUseWallet = authMethod === 'wallet';
  const canUseClerk = authMethod === 'clerk';
  const isMixed = authMethod === 'mixed';

  return {
    hasWallet,
    hasClerk,
    isLoggedIn: hasWallet || hasClerk,
    authMethod,
    canUseWallet,
    canUseClerk,
    isMixed,
  };
}

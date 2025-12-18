'use client';

import { useAuth, useUser } from '@clerk/nextjs';
import { parseIdentityKey } from '@/lib/identityKey';
import { useMemo } from 'react';
import { useAccount } from 'wagmi';

export type AuthMethod = 'none' | 'wallet' | 'clerk' | 'mixed';

export function useAuthStatus() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
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
  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  const identityKey = useMemo(() => {
    if (authMethod === 'wallet' && address) {
      return parseIdentityKey(address);
    }
    if (authMethod === 'clerk' && primaryEmail) {
      return parseIdentityKey(primaryEmail);
    }
    return null;
  }, [authMethod, address, primaryEmail]);

  return {
    hasWallet,
    hasClerk,
    isLoggedIn: hasWallet || hasClerk,
    authMethod,
    canUseWallet,
    canUseClerk,
    isMixed,
    primaryEmail,
    identityKey,
    identityValue: identityKey?.value ?? null,
  };
}

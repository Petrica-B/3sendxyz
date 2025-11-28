import { getAvatar, getName } from '@coinbase/onchainkit/identity';
import { base } from 'viem/chains';

export type IdentityProfile = {
  address: string;
  name?: string;
  avatarUrl?: string;
};

export function identityQueryKey(address: string): [string, string] {
  return ['identity-profile', address.toLowerCase()];
}

export async function fetchIdentityProfile(address: string): Promise<IdentityProfile> {
  const normalized = address?.trim().toLowerCase() as `0x${string}`;
  const profile: IdentityProfile = { address: normalized || address || '' };
  if (!normalized) {
    return profile;
  }

  let resolvedName: string | null = null;
  try {
    resolvedName = await getName({ address: normalized, chain: base });
  } catch (err) {
    console.warn('[identity] getName failed', err);
  }

  if (resolvedName && resolvedName.trim().length > 0) {
    profile.name = resolvedName;
    try {
      const avatar = await getAvatar({ ensName: resolvedName, chain: base });
      if (avatar) {
        profile.avatarUrl = avatar;
      }
    } catch (err) {
      console.warn('[identity] getAvatar failed', err);
    }
  }

  return profile;
}

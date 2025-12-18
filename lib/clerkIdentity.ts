import { parseIdentityKey } from '@/lib/identityKey';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function getClerkIdentityKey() {
  const { userId } = auth();
  if (!userId) return null;
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail =
    user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null;
  if (!primaryEmail) return null;
  return parseIdentityKey(primaryEmail);
}

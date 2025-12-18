import { parseIdentityKey } from '@/lib/identityKey';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function getClerkIdentityKeys() {
  const { userId, sessionClaims } = await auth();
  if (!userId) return [];

  const claimEmails = [
    sessionClaims?.email as string | undefined,
    // Clerk exposes these differently across IdP types
    (sessionClaims as { primary_email_address?: string })?.primary_email_address,
    (sessionClaims as { email_address?: string })?.email_address,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  let userEmails: string[] = [];
  try {
    const user = await (await clerkClient()).users.getUser(userId);
    userEmails = [
      user.primaryEmailAddress?.emailAddress,
      ...user.emailAddresses.map((entry) => entry.emailAddress),
    ].filter((email): email is string => typeof email === 'string' && email.trim().length > 0);
  } catch (error) {
    console.warn('[clerk] Failed to load user emails', error);
  }

  const unique = Array.from(
    new Set([...claimEmails, ...userEmails].map((email) => email.trim().toLowerCase()))
  );
  return unique
    .map((email) => parseIdentityKey(email))
    .filter((entry): entry is NonNullable<ReturnType<typeof parseIdentityKey>> => Boolean(entry));
}

export async function getClerkIdentityKey() {
  const keys = await getClerkIdentityKeys();
  return keys[0] ?? null;
}

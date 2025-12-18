import type { UserProfile } from '@/lib/types';

export function loadProfile(identity: string): UserProfile {
  try {
    const raw = localStorage.getItem(`profile:${identity.toLowerCase()}`);
    return raw ? (JSON.parse(raw) as UserProfile) : {};
  } catch {
    return {};
  }
}

export function saveProfile(identity: string, data: UserProfile) {
  try {
    localStorage.setItem(`profile:${identity.toLowerCase()}`, JSON.stringify(data));
  } catch {
    // no-op: best effort persistence in localStorage
  }
}

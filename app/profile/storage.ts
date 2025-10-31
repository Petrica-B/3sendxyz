import type { UserProfile } from '@/lib/types';

export function loadProfile(addr: string): UserProfile {
  try {
    const raw = localStorage.getItem(`profile:${addr.toLowerCase()}`);
    return raw ? (JSON.parse(raw) as UserProfile) : {};
  } catch {
    return {};
  }
}

export function saveProfile(addr: string, data: UserProfile) {
  try {
    localStorage.setItem(`profile:${addr.toLowerCase()}`, JSON.stringify(data));
  } catch {
    // no-op: best effort persistence in localStorage
  }
}

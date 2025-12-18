import {
  FREE_MICRO_SENDS_PER_MONTH,
  FREE_MICRO_TIER_ID,
  FREE_PAYMENT_REFERENCE_PREFIX,
  FREE_SENDS_CSTORE_HKEY,
} from '@/lib/constants';
import { parseIdentityKey } from '@/lib/identityKey';
import type { FreeSendAllowance } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { createStepTimers } from './timers';

type EdgeSdk = ReturnType<typeof createEdgeSdk>;

type FreeSendUsageRecord = {
  month: string;
  used: number;
  updatedAt: number;
};

function toMonthKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

export function nextMonthReset(timestampMs: number): number {
  const date = new Date(timestampMs);
  const resetDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return resetDate;
}

function toSafeInteger(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function makeIdentityKey(identity: string): string {
  const parsed = parseIdentityKey(identity);
  if (!parsed) {
    throw new Error('Invalid identity for free sends');
  }
  return parsed.storageKey;
}

function parseUsage(raw: string | null, currentMonth: string): FreeSendUsageRecord {
  if (!raw) {
    return { month: currentMonth, used: 0, updatedAt: 0 };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FreeSendUsageRecord>;
    const month =
      typeof parsed.month === 'string' && parsed.month.trim().length > 0
        ? parsed.month
        : currentMonth;
    const used = toSafeInteger(parsed.used);
    const updatedAt = toSafeInteger(parsed.updatedAt);
    if (month !== currentMonth) {
      return { month: currentMonth, used: 0, updatedAt };
    }
    return { month, used, updatedAt };
  } catch {
    return { month: currentMonth, used: 0, updatedAt: 0 };
  }
}

async function readUsage(
  identity: string,
  now: number,
  ratio1?: EdgeSdk
): Promise<FreeSendUsageRecord> {
  const client = ratio1 ?? createEdgeSdk();
  const key = makeIdentityKey(identity);
  let raw: string | null = null;
  try {
    raw = await client.cstore.hget({
      hkey: FREE_SENDS_CSTORE_HKEY,
      key,
    });
  } catch (err) {
    console.warn('[free-sends] hget failed, treating as zeroed usage', err);
  }
  const monthKey = toMonthKey(now);
  return parseUsage(raw, monthKey);
}

export async function getFreeSendAllowance(
  identity: string,
  now: number = Date.now(),
  ratio1?: EdgeSdk
): Promise<FreeSendAllowance> {
  const usage = await readUsage(identity, now, ratio1);
  const monthKey = toMonthKey(now);
  const used = usage.month === monthKey ? usage.used : 0;
  const limit = FREE_MICRO_SENDS_PER_MONTH;
  const remaining = Math.max(0, limit - used);
  return {
    month: monthKey,
    used,
    remaining,
    limit,
    resetsAt: nextMonthReset(now),
  };
}

export async function consumeFreeSend(
  identity: string,
  now: number = Date.now(),
  ratio1?: EdgeSdk
): Promise<FreeSendAllowance & { timings: Record<string, number> }> {
  const timers = createStepTimers();
  const client = ratio1 ?? createEdgeSdk();
  const monthKey = toMonthKey(now);
  const endReadUsage = timers.start('consumeFreeSendReadUsage');
  const usage = await readUsage(identity, now, client);
  endReadUsage();
  const used = usage.month === monthKey ? usage.used : 0;
  if (used >= FREE_MICRO_SENDS_PER_MONTH) {
    throw new Error('No free micro-sends remaining this month.');
  }
  const nextUsage: FreeSendUsageRecord = {
    month: monthKey,
    used: used + 1,
    updatedAt: now,
  };
  const endCstoreWrite = timers.start('consumeFreeSendCstoreWrite');
  await client.cstore.hset({
    hkey: FREE_SENDS_CSTORE_HKEY,
    key: makeIdentityKey(identity),
    value: JSON.stringify(nextUsage),
  });
  endCstoreWrite();
  return {
    month: monthKey,
    used: nextUsage.used,
    remaining: Math.max(0, FREE_MICRO_SENDS_PER_MONTH - nextUsage.used),
    limit: FREE_MICRO_SENDS_PER_MONTH,
    resetsAt: nextMonthReset(now),
    timings: timers.timings,
  };
}

export function isFreePaymentReference(ref: string | null | undefined): boolean {
  if (typeof ref !== 'string') return false;
  return ref.trim().toLowerCase().startsWith(FREE_PAYMENT_REFERENCE_PREFIX);
}

export function isMicroTier(id: number): boolean {
  return id === FREE_MICRO_TIER_ID;
}

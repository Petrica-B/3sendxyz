import createEdgeSdk from '@ratio1/edge-sdk-ts';
import { unstable_cache } from 'next/cache';

import { STATS_CSTORE_HKEY } from './constants';
import { createStepTimers } from './timers';
import type { AddressStatsRecord, PlatformStatsRecord } from './types';

const TOTALS_KEY = 'totals';
const ADDRESS_KEY_PREFIX = 'addr:';
export const PLATFORM_STATS_CACHE_TAG = 'stats:platform';

type EdgeSdk = ReturnType<typeof createEdgeSdk>;

function getAddressKey(address: string): string {
  return `${ADDRESS_KEY_PREFIX}${address}`;
}

function toSafeInteger(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function toBigIntString(value: unknown): string {
  try {
    const asBigInt = typeof value === 'bigint' ? value : BigInt(value as string);
    return asBigInt >= 0n ? asBigInt.toString() : '0';
  } catch {
    return '0';
  }
}

function createEmptyPlatformStats(): PlatformStatsRecord {
  return {
    totalSentFiles: 0,
    totalBytesSent: 0,
    uniqueUsers: 0,
    totalR1Burned: '0',
    updatedAt: 0,
  };
}

function createEmptyAddressStats(address: string): AddressStatsRecord {
  return {
    address,
    sentFiles: 0,
    sentBytes: 0,
    receivedFiles: 0,
    receivedBytes: 0,
    totalR1Burned: '0',
    updatedAt: 0,
  };
}

function parsePlatformStats(raw: string | null): PlatformStatsRecord {
  if (!raw) return createEmptyPlatformStats();
  try {
    const parsed = JSON.parse(raw) as Partial<PlatformStatsRecord>;
    const stats = createEmptyPlatformStats();
    stats.totalSentFiles = toSafeInteger(parsed.totalSentFiles);
    stats.totalBytesSent = toSafeInteger(parsed.totalBytesSent);
    const legacyUniqueSenders = (parsed as any)?.uniqueSenders;
    const legacyUniqueReceivers = (parsed as any)?.uniqueReceivers;
    const inferredUniqueUsers =
      parsed.uniqueUsers ??
      (typeof legacyUniqueSenders === 'number' || typeof legacyUniqueReceivers === 'number'
        ? Math.max(toSafeInteger(legacyUniqueSenders), toSafeInteger(legacyUniqueReceivers))
        : 0);
    stats.uniqueUsers = toSafeInteger(inferredUniqueUsers);
    stats.totalR1Burned = toBigIntString(parsed.totalR1Burned);
    stats.updatedAt = toSafeInteger(parsed.updatedAt);
    return stats;
  } catch {
    return createEmptyPlatformStats();
  }
}

function parseAddressStats(raw: string | null, address: string): AddressStatsRecord {
  if (!raw) return createEmptyAddressStats(address);
  try {
    const parsed = JSON.parse(raw) as Partial<AddressStatsRecord>;
    const stats = createEmptyAddressStats(address);
    stats.sentFiles = toSafeInteger(parsed.sentFiles);
    stats.sentBytes = toSafeInteger(parsed.sentBytes);
    stats.receivedFiles = toSafeInteger(parsed.receivedFiles);
    stats.receivedBytes = toSafeInteger(parsed.receivedBytes);
    stats.totalR1Burned = toBigIntString(parsed.totalR1Burned);
    stats.updatedAt = toSafeInteger(parsed.updatedAt);
    return stats;
  } catch {
    return createEmptyAddressStats(address);
  }
}

async function safeHget(client: EdgeSdk, key: string): Promise<string | null> {
  try {
    const value = await client.cstore.hget({
      hkey: STATS_CSTORE_HKEY,
      key,
    });
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function addBigIntStrings(base: string, delta: bigint | string): string {
  let baseBig = 0n;
  let deltaBig = 0n;
  try {
    baseBig = BigInt(base);
  } catch {
    baseBig = 0n;
  }
  try {
    deltaBig = typeof delta === 'bigint' ? delta : BigInt(delta);
  } catch {
    deltaBig = 0n;
  }
  const sum = baseBig + deltaBig;
  return sum >= 0 ? sum.toString() : '0';
}

async function writeStats(client: EdgeSdk, key: string, value: unknown): Promise<void> {
  await client.cstore.hset({
    hkey: STATS_CSTORE_HKEY,
    key,
    value: JSON.stringify(value),
  });
}

export async function fetchPlatformStats(ratio1?: EdgeSdk): Promise<PlatformStatsRecord> {
  const client = ratio1 ?? createEdgeSdk();
  const raw = await safeHget(client, TOTALS_KEY);
  return parsePlatformStats(raw);
}

export async function fetchAddressStats(
  address: string,
  ratio1?: EdgeSdk
): Promise<AddressStatsRecord> {
  const client = ratio1 ?? createEdgeSdk();
  const normalized = address.toLowerCase();
  const raw = await safeHget(client, getAddressKey(normalized));
  const parsed = parseAddressStats(raw, normalized);
  parsed.address = normalized;
  return parsed;
}

export async function updateStatsAfterUpload(args: {
  ratio1: EdgeSdk;
  sender: string;
  recipient: string;
  filesize: number;
  r1Burn: bigint | string;
}): Promise<{
  totals: PlatformStatsRecord;
  sender: AddressStatsRecord;
  recipient: AddressStatsRecord;
  timings: Record<string, number>;
}> {
  const timers = createStepTimers();
  const { ratio1, sender, recipient, filesize, r1Burn } = args;
  const senderLc = sender.toLowerCase();
  const recipientLc = recipient.toLowerCase();
  const sameAddress = senderLc === recipientLc;

  const endFetchStats = timers.start('updateStatsAfterUploadFetchStats');
  const [totals, senderStats, recipientStatsRaw] = await Promise.all([
    fetchPlatformStats(ratio1),
    fetchAddressStats(senderLc, ratio1),
    sameAddress ? Promise.resolve(null) : fetchAddressStats(recipientLc, ratio1),
  ]);
  endFetchStats();

  const endPrepareStats = timers.start('updateStatsAfterUploadPrepareStats');
  const now = Date.now();
  const safeFilesize = toSafeInteger(filesize);
  const senderPrevInteractions = senderStats.sentFiles + senderStats.receivedFiles;
  const recipientPrevInteractions = sameAddress
    ? senderPrevInteractions
    : (recipientStatsRaw?.sentFiles ?? 0) + (recipientStatsRaw?.receivedFiles ?? 0);

  senderStats.sentFiles += 1;
  senderStats.sentBytes += safeFilesize;
  senderStats.totalR1Burned = addBigIntStrings(senderStats.totalR1Burned, r1Burn);
  senderStats.updatedAt = now;

  const recipientStats = sameAddress
    ? senderStats
    : (recipientStatsRaw ?? createEmptyAddressStats(recipientLc));

  recipientStats.receivedFiles += 1;
  recipientStats.receivedBytes += safeFilesize;
  recipientStats.updatedAt = now;

  totals.totalSentFiles += 1;
  totals.totalBytesSent += safeFilesize;
  totals.totalR1Burned = addBigIntStrings(totals.totalR1Burned, r1Burn);
  const senderInteractionsNow = senderStats.sentFiles + senderStats.receivedFiles;
  if (senderPrevInteractions === 0 && senderInteractionsNow > 0) {
    totals.uniqueUsers += 1;
  }
  if (!sameAddress) {
    const recipientInteractionsNow = recipientStats.sentFiles + recipientStats.receivedFiles;
    if (recipientPrevInteractions === 0 && recipientInteractionsNow > 0) {
      totals.uniqueUsers += 1;
    }
  }
  totals.updatedAt = now;
  endPrepareStats();

  const endCstoreWrite = timers.start('updateStatsAfterUploadCstoreWrite');
  const writes: Promise<void>[] = [
    writeStats(ratio1, TOTALS_KEY, totals),
    writeStats(ratio1, getAddressKey(senderLc), senderStats),
  ];
  if (!sameAddress) {
    writes.push(writeStats(ratio1, getAddressKey(recipientLc), recipientStats));
  }
  await Promise.all(writes);
  endCstoreWrite();

  return {
    totals,
    sender: senderStats,
    recipient: recipientStats,
    timings: timers.timings,
  };
}

const cachedPlatformStats = unstable_cache(
  async () => {
    const ratio1 = createEdgeSdk();
    return fetchPlatformStats(ratio1);
  },
  ['3sendxyz-platform-stats'],
  { revalidate: 60, tags: [PLATFORM_STATS_CACHE_TAG] }
);

export const getCachedPlatformStats = cachedPlatformStats;

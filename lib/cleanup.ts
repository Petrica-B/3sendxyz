import { FILE_CLEANUP_INDEX_CSTORE_HKEY, FILE_EXPIRATION_MS } from '@/lib/constants';
import type { FileCleanupIndexEntry } from '@/lib/types';
import createEdgeSdk from '@ratio1/edge-sdk-ts';

type CleanupLogger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

const defaultLogger: CleanupLogger = {
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

function parseEntry(raw: string): FileCleanupIndexEntry | null {
  try {
    const parsed = JSON.parse(raw) as FileCleanupIndexEntry;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.txHash !== 'string') return null;
    if (typeof parsed.cid !== 'string') return null;
    if (typeof parsed.recipient !== 'string') return null;
    if (typeof parsed.initiator !== 'string') return null;
    if (typeof parsed.sentAt !== 'number') return null;
    if (parsed.expiresAt !== undefined && typeof parsed.expiresAt !== 'number') return null;
    if (parsed.state !== 'active' && parsed.state !== 'deleted') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function markEntryDeleted(
  sdk: ReturnType<typeof createEdgeSdk>,
  entry: FileCleanupIndexEntry,
  now: number
) {
  const updated: FileCleanupIndexEntry = {
    ...entry,
    state: 'deleted',
    markedDeletedAt: now,
  };
  await sdk.cstore.hset({
    hkey: FILE_CLEANUP_INDEX_CSTORE_HKEY,
    key: entry.txHash,
    value: JSON.stringify(updated),
  });
}

export async function runFileCleanup(options?: {
  logger?: CleanupLogger;
}): Promise<{ processed: number; deleted: number }> {
  const logger = options?.logger ?? defaultLogger;
  const now = Date.now();
  const threshold = now - FILE_EXPIRATION_MS;
  logger.info(
    `[cleanup] Starting cleanup for uploads older than ${FILE_EXPIRATION_MS} ms (threshold=${new Date(
      threshold
    ).toISOString()})`
  );

  const sdk = createEdgeSdk();
  let rawEntries: Record<string, string> = {};
  try {
    rawEntries = await sdk.cstore.hgetall({
      hkey: FILE_CLEANUP_INDEX_CSTORE_HKEY,
    });
  } catch (err) {
    logger.error('[cleanup] Failed to read cleanup index', err);
    throw err;
  }

  const candidates: FileCleanupIndexEntry[] = [];
  for (const [key, raw] of Object.entries(rawEntries)) {
    if (typeof raw !== 'string') continue;
    const entry = parseEntry(raw);
    if (!entry) {
      logger.warn(`[cleanup] Skipping malformed cleanup entry ${key}`);
      continue;
    }
    if (entry.state === 'deleted') continue;
    const entryExpiresAt = entry.expiresAt ?? entry.sentAt + FILE_EXPIRATION_MS;
    if (entryExpiresAt <= now) {
      candidates.push(entry);
    }
  }

  if (candidates.length === 0) {
    logger.info('[cleanup] No uploads eligible for deletion');
    return { processed: 0, deleted: 0 };
  }

  const processedAt = Date.now();
  for (const entry of candidates) {
    logger.info(
      `[cleanup] Marking upload ${entry.txHash} (cid=${entry.cid}) for deletion; sentAt=${new Date(
        entry.sentAt
      ).toISOString()}`
    );

    // TODO: remove upload metadata from cstore and the associated file from r1fs once delete APIs are available.

    await markEntryDeleted(sdk, entry, processedAt);
  }

  logger.info(`[cleanup] Processed ${candidates.length} upload(s) for deletion`);
  return { processed: candidates.length, deleted: candidates.length };
}

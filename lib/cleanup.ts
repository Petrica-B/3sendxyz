import {
  FILE_CLEANUP_INDEX_CSTORE_HKEY,
  FILE_EXPIRATION_MS,
  RECEIVED_FILES_CSTORE_HKEY,
  SENT_FILES_CSTORE_HKEY,
} from '@/lib/constants';
import { parseIdentityKey } from '@/lib/identityKey';
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

const CSTORE_NULL_VALUE = null as unknown as object;

function parseEntry(raw: string): FileCleanupIndexEntry | null {
  try {
    const parsed = JSON.parse(raw) as FileCleanupIndexEntry;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.txHash !== 'string') return null;
    if (typeof parsed.cid !== 'string') return null;
    if (typeof parsed.recipient !== 'string') return null;
    if (typeof parsed.initiator !== 'string') return null;
    if (typeof parsed.sentAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function runFileCleanup(options?: {
  logger?: CleanupLogger;
}): Promise<{ processed: number; deleted: number }> {
  const logger = options?.logger ?? defaultLogger;
  const now = Date.now();
  const threshold = now - FILE_EXPIRATION_MS;
  const retentionDays = Math.max(1, Math.round(FILE_EXPIRATION_MS / (24 * 60 * 60 * 1000)));
  logger.info(
    `[cleanup] Starting cleanup for uploads older than ${retentionDays} day(s) (threshold=${new Date(
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
    if (entry.sentAt <= threshold) {
      candidates.push(entry);
    }
  }

  if (candidates.length === 0) {
    logger.info('[cleanup] No uploads eligible for deletion');
    return { processed: 0, deleted: 0 };
  }

  let deletedCount = 0;
  let processedCount = 0;

  for (const entry of candidates) {
    processedCount += 1;
    logger.info(
      `[cleanup] Removing upload ${entry.txHash} (cid=${entry.cid}); sentAt=${new Date(
        entry.sentAt
      ).toISOString()}`
    );

    let succeeded = true;

    try {
      await sdk.r1fs.deleteFile({ cid: entry.cid });
    } catch (err) {
      succeeded = false;
      logger.error(
        `[cleanup] Failed to delete file from r1fs for tx=${entry.txHash} cid=${entry.cid}`,
        err
      );
    }

    if (succeeded) {
      const recipientIdentity = parseIdentityKey(entry.recipient);
      const initiatorIdentity = parseIdentityKey(entry.initiator);
      const recipientKeys = recipientIdentity
        ? [recipientIdentity.storageKey, ...recipientIdentity.legacyKeys]
        : [entry.recipient];
      const initiatorKeys = initiatorIdentity
        ? [initiatorIdentity.storageKey, ...initiatorIdentity.legacyKeys]
        : [entry.initiator];
      const operations: Array<{ hkey: string; key: string }> = [
        ...recipientKeys.map((key) => ({
          hkey: `${RECEIVED_FILES_CSTORE_HKEY}_${key}`,
          key: entry.txHash,
        })),
        ...initiatorKeys.map((key) => ({
          hkey: `${SENT_FILES_CSTORE_HKEY}_${key}`,
          key: entry.txHash,
        })),
      ];

      for (const op of operations) {
        try {
          await sdk.cstore.hset({
            hkey: op.hkey,
            key: op.key,
            value: CSTORE_NULL_VALUE,
          });
        } catch (err) {
          succeeded = false;
          logger.error(
            `[cleanup] Failed to remove cstore entry ${op.hkey}/${op.key} for tx=${entry.txHash}`,
            err
          );
        }
      }
    }

    if (succeeded) {
      try {
        await sdk.cstore.hset({
          hkey: FILE_CLEANUP_INDEX_CSTORE_HKEY,
          key: entry.txHash,
          value: CSTORE_NULL_VALUE,
        });
        deletedCount += 1;
      } catch (err) {
        succeeded = false;
        logger.error(`[cleanup] Failed to remove cleanup index entry for tx=${entry.txHash}`, err);
      }
    }

    if (!succeeded) {
      logger.warn(`[cleanup] Cleanup for tx=${entry.txHash} incomplete; leaving entry for retry`);
    }
  }

  logger.info(`[cleanup] Processed ${processedCount} upload(s); deleted ${deletedCount}`);
  return { processed: processedCount, deleted: deletedCount };
}

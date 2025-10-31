import { runFileCleanup } from '@/lib/cleanup';

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

function parseIntervalMs(): number {
  const fromMs = Number(process.env.FILE_CLEANUP_INTERVAL_MS);
  if (Number.isFinite(fromMs) && fromMs > 0) {
    return fromMs;
  }
  const fromMinutes = Number(process.env.FILE_CLEANUP_INTERVAL_MINUTES);
  if (Number.isFinite(fromMinutes) && fromMinutes > 0) {
    return fromMinutes * 60 * 1000;
  }
  return 60 * 60 * 1000; // default hourly
}

async function triggerCleanup() {
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    await runFileCleanup();
  } catch (err) {
    console.error('[cleanup] Scheduled run failed', err);
  } finally {
    isRunning = false;
  }
}

export function scheduleFileCleanup() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }
  if (process.env.FILE_CLEANUP_DISABLED === '1') {
    console.info('[cleanup] Scheduler disabled via FILE_CLEANUP_DISABLED');
    return;
  }
  if (intervalHandle) {
    return;
  }

  const intervalMs = parseIntervalMs();
  console.info(
    `[cleanup] Scheduler starting with interval ${intervalMs}ms`
  );

  // Fire once on boot to avoid waiting for the first interval.
  triggerCleanup().catch((err) => {
    console.error('[cleanup] Initial scheduled run failed', err);
  });

  intervalHandle = setInterval(() => {
    triggerCleanup().catch((err) => {
      console.error('[cleanup] Interval run failed', err);
    });
  }, intervalMs);

  intervalHandle.unref?.();
}

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return;
  }
  const { scheduleFileCleanup } = await import('./lib/serverCleanupScheduler');
  scheduleFileCleanup();
}

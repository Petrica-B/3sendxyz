#!/usr/bin/env node

import { runFileCleanup } from '@/lib/cleanup';

runFileCleanup().catch((err) => {
  console.error('[cleanup] Unexpected error', err);
  process.exitCode = 1;
});

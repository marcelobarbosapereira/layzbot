'use server';

import { getBatchProgress } from './queries';

export async function refreshBatchProgress(batchId: string) {
  return getBatchProgress(batchId);
}

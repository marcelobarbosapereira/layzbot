import { z } from 'zod';

export const confirmBatchInput = z.object({
  competence: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/),
  deviceId: z.string().uuid(),
  assessmentIds: z.array(z.string().uuid()).min(1).refine((ids) => new Set(ids).size === ids.length, 'Seleção duplicada.'),
});
export const batchSummary = z.object({
  batchId: z.string().uuid(),
  itemCount: z.number().int().positive(),
  totalRevenueCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type ConfirmBatchInput = z.infer<typeof confirmBatchInput>;
export type BatchSummary = z.infer<typeof batchSummary>;
export type ConfirmBatchResult =
  | { status: 'success'; summary: BatchSummary }
  | { status: 'error'; message: string; fieldErrors?: Partial<Record<keyof ConfirmBatchInput, string[]>> };

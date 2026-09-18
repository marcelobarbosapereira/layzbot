import { z } from 'zod';

export const artifact = z.object({
  id: z.string().uuid(),
  batchItemId: z.string().uuid(),
  kind: z.enum(['das', 'receipt', 'error_screenshot', 'report']),
  objectPath: z.string().min(1),
  originalName: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.string().datetime({ offset: true }),
});
export type Artifact = z.infer<typeof artifact>;

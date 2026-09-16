import { z } from 'zod';

export const responsibleInput = z.object({
  name: z.string().trim().min(2),
  document: z.string().regex(/^\d{11}$|^\d{14}$/),
});

export const taxpayerInput = responsibleInput.extend({
  responsibleId: z.string().uuid(),
});

export type ResponsibleInput = z.infer<typeof responsibleInput>;
export type TaxpayerInput = z.infer<typeof taxpayerInput>;

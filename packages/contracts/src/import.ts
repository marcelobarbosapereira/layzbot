import { z } from 'zod';

export const importObligation = z.enum(['inss', 'fgts', 'gps', 'esocial', 'simples', 'dctf_web']);
export const simpleActivity = z.enum(['commerce', 'services']);

export const importRow = z.object({
  rowNumber: z.number().int().positive(),
  sheet: z.string().min(1),
  obligation: importObligation,
  name: z.string().trim().min(2),
  document: z.string().regex(/^\d{11}$|^\d{14}$/),
  responsibleName: z.string().trim().min(2),
  responsibleDocument: z.string().regex(/^\d{11}$|^\d{14}$/),
  configuration: z.record(z.string(), z.unknown()),
  revenue: z.number().nonnegative().optional(),
  revenueCents: z.number().int().nonnegative().optional(),
  activity: simpleActivity.optional(),
  taxOption: z.string().trim().min(1).optional(),
});

export type ImportObligation = z.infer<typeof importObligation>;
export type SimpleActivity = z.infer<typeof simpleActivity>;
export type ImportRow = z.infer<typeof importRow>;

export type InvalidImportRow = ImportRow & { errors: string[] };

export type ImportPreview = {
  validRows: ImportRow[];
  invalidRows: InvalidImportRow[];
  summary: Record<string, number>;
};

export type ImportCommitResult = {
  processedRows: number;
};

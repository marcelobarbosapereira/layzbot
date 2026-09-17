export const APP_NAME = 'LazyBot';

export { importObligation, importRow, simpleActivity } from './import';
export type {
  ImportCommitResult,
  ImportObligation,
  ImportPreview,
  ImportRow,
  InvalidImportRow,
  SimpleActivity,
} from './import';
export { buildOwnerStoragePrefix } from './storage-path';
export { responsibleInput, taxpayerInput } from './taxpayer';
export type { ResponsibleInput, TaxpayerInput } from './taxpayer';

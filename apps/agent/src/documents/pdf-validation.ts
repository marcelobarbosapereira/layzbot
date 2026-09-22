import { sha256 } from './naming.js';

export type PdfDocumentKind = 'das' | 'receipt';
export type PdfValidationInput = { bytes: Uint8Array; kind: PdfDocumentKind; competence: string; taxpayer: string };
export type PdfValidationResult = { valid: true; sha256: string; byteSize: number; text: string } | { valid: false; code: 'EMPTY_PDF' | 'INVALID_PDF_SIGNATURE' | 'WRONG_COMPETENCE' | 'WRONG_TAXPAYER' | 'WRONG_DOCUMENT_KIND' };

/** Fixture-safe PDF check. Text extraction intentionally avoids persisting document contents. */
export function validatePdf(input: PdfValidationInput): PdfValidationResult {
  if (input.bytes.byteLength === 0) return { valid: false, code: 'EMPTY_PDF' };
  const header = Buffer.from(input.bytes).subarray(0, 5).toString('ascii');
  if (header !== '%PDF-') return { valid: false, code: 'INVALID_PDF_SIGNATURE' };
  const text = Buffer.from(input.bytes).toString('latin1').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
  if (!text.includes(input.competence)) return { valid: false, code: 'WRONG_COMPETENCE' };
  if (!text.includes(input.taxpayer)) return { valid: false, code: 'WRONG_TAXPAYER' };
  const marker = input.kind === 'das' ? /\bDAS\b/i : /recibo|PGDAS/i;
  if (!marker.test(text)) return { valid: false, code: 'WRONG_DOCUMENT_KIND' };
  return { valid: true, sha256: sha256(input.bytes), byteSize: input.bytes.byteLength, text: text.slice(0, 4096) };
}

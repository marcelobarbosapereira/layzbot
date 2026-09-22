import { describe, expect, it } from 'vitest';
import { validatePdf } from './pdf-validation.js';

const pdf = (text: string) => new TextEncoder().encode(`%PDF-1.7\n${text}\n%%EOF`);
const base = { kind: 'das' as const, competence: '09-2026', taxpayer: 'Fixture Empresa' };
describe('fixture PDF validation', () => {
  it('rejects empty and wrong signatures', () => {
    expect(validatePdf({ ...base, bytes: new Uint8Array() })).toMatchObject({ valid: false, code: 'EMPTY_PDF' });
    expect(validatePdf({ ...base, bytes: new TextEncoder().encode('not pdf') })).toMatchObject({ valid: false, code: 'INVALID_PDF_SIGNATURE' });
  });
  it('rejects wrong competence, taxpayer, and document kind', () => {
    expect(validatePdf({ ...base, bytes: pdf('DAS Fixture Empresa 08-2026') })).toMatchObject({ code: 'WRONG_COMPETENCE' });
    expect(validatePdf({ ...base, bytes: pdf('DAS 09-2026 Outra') })).toMatchObject({ code: 'WRONG_TAXPAYER' });
    expect(validatePdf({ ...base, kind: 'receipt', bytes: pdf('DAS 09-2026 Fixture Empresa') })).toMatchObject({ code: 'WRONG_DOCUMENT_KIND' });
  });
  it('returns hash and size for a matching DAS or receipt', () => {
    const result = validatePdf({ ...base, bytes: pdf('DAS 09-2026 Fixture Empresa') });
    expect(result).toMatchObject({ valid: true, byteSize: expect.any(Number), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const receipt = validatePdf({ ...base, kind: 'receipt', bytes: pdf('Recibo PGDAS 09-2026 Fixture Empresa') });
    expect(receipt.valid).toBe(true);
  });
});

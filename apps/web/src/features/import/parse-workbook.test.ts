import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseWorkbook } from './parse-workbook';

async function fixture(name: 'lazybot-valid.xlsx' | 'lazybot-invalid.xlsx') {
  return readFile(path.resolve(process.cwd(), '../../tests/fixtures', name));
}

describe('parseWorkbook', () => {
  it('maps Simples Valor to monthly revenue without changing the source bytes', async () => {
    const bytes = await fixture('lazybot-valid.xlsx');
    const original = Buffer.from(bytes);

    const preview = await parseWorkbook(bytes);
    const simple = preview.validRows.find((row) => row.obligation === 'simples');

    expect(simple).toMatchObject({
      document: '27182818000129',
      revenue: 10000,
      revenueCents: 1000000,
      activity: 'commerce',
    });
    expect(bytes).toEqual(original);
  });

  it('normalizes the six expected sheet names and reports their row counts', async () => {
    const preview = await parseWorkbook(await fixture('lazybot-valid.xlsx'));

    expect(preview.summary).toMatchObject({
      inss: 1,
      fgts: 1,
      gps: 1,
      esocial: 1,
      simples: 1,
      dctf_web: 1,
      valid: 6,
      invalid: 0,
    });
  });

  it('deduplicates normalized taxpayer documents without dropping obligations', async () => {
    const preview = await parseWorkbook(await fixture('lazybot-valid.xlsx'));
    const obligations = preview.validRows
      .filter((row) => row.document === '31415926590')
      .map((row) => row.obligation)
      .sort();

    expect(obligations).toEqual(['esocial', 'fgts', 'inss']);
    expect(preview.summary.taxpayers).toBe(3);
  });

  it('keeps invalid rows with their exact source location, document, and reasons', async () => {
    const preview = await parseWorkbook(await fixture('lazybot-invalid.xlsx'));
    const invalidCpf = preview.invalidRows.find((row) => row.sheet === 'INSS');

    expect(invalidCpf).toMatchObject({
      rowNumber: 2,
      sheet: 'INSS',
      document: '12345678900',
      errors: ['CPF inválido'],
    });
    expect(preview.invalidRows.length).toBe(6);
    expect(preview.summary).toMatchObject({ valid: 0, invalid: 6 });
  });
});

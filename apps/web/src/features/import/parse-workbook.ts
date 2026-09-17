import type {
  ImportObligation,
  ImportPreview,
  ImportRow,
  InvalidImportRow,
  SimpleActivity,
} from '@lazybot/contracts';
import ExcelJS from 'exceljs';

type SheetDefinition = {
  name: string;
  obligation: ImportObligation;
};

const SHEETS = new Map<string, SheetDefinition>([
  ['inss', { name: 'INSS', obligation: 'inss' }],
  ['fgts', { name: 'FGTS', obligation: 'fgts' }],
  ['gps', { name: 'GPS', obligation: 'gps' }],
  ['esocial', { name: 'eSocial', obligation: 'esocial' }],
  ['simples', { name: 'Simples', obligation: 'simples' }],
  ['dctf vazia', { name: 'DCTF Vazia', obligation: 'dctf_web' }],
]);

type CellScalar = string | number | boolean | Date | null | undefined;

function normalizeLabel(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function cellScalar(value: ExcelJS.CellValue): CellScalar {
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  if ('result' in value) return cellScalar(value.result as ExcelJS.CellValue);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('text' in value) return value.text;
  return String(value);
}

function cellText(value: ExcelJS.CellValue): string {
  const scalar = cellScalar(value);
  return scalar === null || scalar === undefined ? '' : String(scalar).trim();
}

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function allDigitsEqual(value: string): boolean {
  return new Set(value).size === 1;
}

function validCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || allDigitsEqual(value)) return false;
  const numbers = [...value].map(Number);
  for (let length = 9; length <= 10; length += 1) {
    const sum = numbers.slice(0, length).reduce((total, digit, index) => total + digit * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    if (numbers[length] !== (remainder === 10 ? 0 : remainder)) return false;
  }
  return true;
}

function validCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || allDigitsEqual(value)) return false;
  const numbers = [...value].map(Number);
  const bases = [numbers.slice(0, 12), numbers.slice(0, 13)];
  const weights = [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ];
  return bases.every((base, index) => {
    const sum = base.reduce((total, digit, digitIndex) => total + digit * weights[index][digitIndex], 0);
    const remainder = sum % 11;
    return numbers[12 + index] === (remainder < 2 ? 0 : 11 - remainder);
  });
}

function validNit(value: string): boolean {
  if (!/^\d{11}$/.test(value) || allDigitsEqual(value)) return false;
  const numbers = [...value].map(Number);
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = numbers.slice(0, 10).reduce((total, digit, index) => total + digit * weights[index], 0);
  const remainder = 11 - (sum % 11);
  return numbers[10] === (remainder === 10 || remainder === 11 ? 0 : remainder);
}

function validTaxDocument(value: string): boolean {
  return validCpf(value) || validCnpj(value);
}

function parseMoney(value: CellScalar): { amount?: number; cents?: number } {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return {};
    return { amount: value, cents: Math.round(value * 100) };
  }
  const raw = String(value ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!raw) return {};
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return {};
  return { amount, cents: Math.round(amount * 100) };
}

function parseActivity(value: string): SimpleActivity | undefined {
  const normalized = normalizeLabel(value);
  if (normalized === 'comercio') return 'commerce';
  if (normalized === 'servicos' || normalized === 'servico') return 'services';
  return undefined;
}

function parseBoolean(value: string): boolean | undefined {
  const normalized = normalizeLabel(value);
  if (['sim', 's', 'yes', 'true', '1'].includes(normalized)) return true;
  if (['nao', 'n', 'no', 'false', '0'].includes(normalized)) return false;
  return undefined;
}

function headerIndex(row: ExcelJS.Row): Map<string, number> {
  const headers = new Map<string, number>();
  row.eachCell({ includeEmpty: false }, (cell, column) => {
    headers.set(normalizeLabel(cellText(cell.value)), column);
  });
  return headers;
}

function read(row: ExcelJS.Row, headers: Map<string, number>, ...names: string[]): CellScalar {
  for (const name of names) {
    const column = headers.get(normalizeLabel(name));
    if (column) return cellScalar(row.getCell(column).value);
  }
  return undefined;
}

function parseRow(row: ExcelJS.Row, definition: SheetDefinition, headers: Map<string, number>): ImportRow | InvalidImportRow {
  const name = String(read(row, headers, 'Nome') ?? '').trim();
  const document = digits(read(row, headers, 'CPF/CNPJ', 'CPF', 'CNPJ', 'Documento'));
  const responsibleName = String(read(row, headers, 'Responsável', 'Responsavel') ?? '').trim();
  const responsibleDocument = digits(
    read(row, headers, 'Documento do responsável', 'Documento responsável', 'CPF/CNPJ do responsável'),
  );
  const errors: string[] = [];
  const configuration: Record<string, unknown> = {};

  if (name.length < 2) errors.push('Nome obrigatório');
  if (responsibleName.length < 2) errors.push('Responsável obrigatório');
  if (!validTaxDocument(responsibleDocument)) errors.push('Documento do responsável inválido');

  if (definition.obligation === 'inss' || definition.obligation === 'fgts' || definition.obligation === 'esocial') {
    if (!validCpf(document)) errors.push('CPF inválido');
  } else if (definition.obligation === 'simples') {
    if (!validCnpj(document)) errors.push('CNPJ inválido');
  } else if (!validTaxDocument(document)) {
    errors.push('CPF/CNPJ inválido');
  }

  const parsed: ImportRow = {
    rowNumber: row.number,
    sheet: definition.name,
    obligation: definition.obligation,
    name,
    document,
    responsibleName,
    responsibleDocument,
    configuration,
  };

  if (definition.obligation === 'gps') {
    const nit = digits(read(row, headers, 'NIT'));
    const code = String(read(row, headers, 'Código', 'Codigo') ?? '').trim();
    const money = parseMoney(read(row, headers, 'Valor'));
    if (!validNit(nit)) errors.push('NIT inválido');
    if (!code) errors.push('Código obrigatório');
    if (money.amount === undefined || money.amount < 0 || money.cents === undefined) errors.push('Valor inválido');
    parsed.configuration = { nit, code, amountCents: money.cents };
  }

  if (definition.obligation === 'esocial') {
    const hasPayroll = parseBoolean(String(read(row, headers, 'Indicador de folha') ?? ''));
    if (hasPayroll === undefined) errors.push('Indicador de folha inválido');
    parsed.configuration = { hasPayroll };
  }

  if (definition.obligation === 'simples') {
    const money = parseMoney(read(row, headers, 'Valor'));
    const activity = parseActivity(String(read(row, headers, 'Atividade') ?? ''));
    const taxOption = String(read(row, headers, 'Opção tributária', 'Opcao tributaria') ?? '').trim();
    if (money.amount === undefined || money.amount < 0 || money.cents === undefined) errors.push('Valor inválido');
    if (!activity) errors.push('Atividade inválida');
    if (!taxOption) errors.push('Opção tributária obrigatória');
    parsed.revenue = money.amount;
    parsed.revenueCents = money.cents;
    parsed.activity = activity;
    parsed.taxOption = taxOption;
  }

  return errors.length ? { ...parsed, errors } : parsed;
}

export async function parseWorkbook(bytes: Uint8Array): Promise<ImportPreview> {
  const workbook = new ExcelJS.Workbook();
  const workbookBytes = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(workbookBytes).set(bytes);
  await workbook.xlsx.load(workbookBytes);

  const validRows: ImportRow[] = [];
  const invalidRows: InvalidImportRow[] = [];
  const summary: Record<string, number> = {
    inss: 0,
    fgts: 0,
    gps: 0,
    esocial: 0,
    simples: 0,
    dctf_web: 0,
    valid: 0,
    invalid: 0,
    taxpayers: 0,
  };

  const seenSheets = new Set<string>();
  for (const worksheet of workbook.worksheets) {
    const sheetKey = normalizeLabel(worksheet.name);
    const definition = SHEETS.get(sheetKey);
    if (!definition || seenSheets.has(sheetKey)) continue;
    seenSheets.add(sheetKey);
    const headers = headerIndex(worksheet.getRow(1));
    for (let rowNumber = 2; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      if (!row.hasValues) continue;
      const parsed = parseRow(row, definition, headers);
      if ('errors' in parsed) {
        invalidRows.push(parsed);
      } else {
        validRows.push(parsed);
        summary[definition.obligation] += 1;
      }
    }
  }

  for (const [sheetKey, definition] of SHEETS) {
    if (seenSheets.has(sheetKey)) continue;
    invalidRows.push({
      rowNumber: 1,
      sheet: definition.name,
      obligation: definition.obligation,
      name: '',
      document: '',
      responsibleName: '',
      responsibleDocument: '',
      configuration: {},
      errors: ['Aba obrigatória ausente'],
    });
  }

  summary.valid = validRows.length;
  summary.invalid = invalidRows.length;
  summary.taxpayers = new Set(validRows.map((row) => row.document)).size;

  return { validRows, invalidRows, summary };
}

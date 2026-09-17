import { commitImport, previewImport } from './actions';

const { getUser, parseWorkbook, rpc } = vi.hoisted(() => ({
  getUser: vi.fn(),
  parseWorkbook: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, rpc }),
}));
vi.mock('./parse-workbook', () => ({ parseWorkbook }));

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: '10000000-0000-4000-8000-000000000011' } }, error: null });
});

it('stores only server-validated rows and returns invalid rows for preview', async () => {
  const validRow = {
    rowNumber: 2,
    sheet: 'INSS',
    obligation: 'inss',
    name: 'Pessoa Fictícia Delta',
    document: '31415926590',
    responsibleName: 'Escritório Fictício Delta',
    responsibleDocument: '99988877000108',
    configuration: {},
  };
  const invalidRow = { ...validRow, rowNumber: 3, document: '12345678900', errors: ['CPF inválido'] };
  parseWorkbook.mockResolvedValue({
    validRows: [validRow],
    invalidRows: [invalidRow],
    summary: { valid: 1, invalid: 1, taxpayers: 1 },
  });
  rpc.mockResolvedValue({ data: '40000000-0000-4000-8000-000000000011', error: null });
  const file = new File([new Uint8Array([1, 2, 3])], 'cadastros.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const form = new FormData();
  form.set('competence', '2026-09');
  form.set('workbook', file);

  const result = await previewImport({ status: 'idle' }, form);

  expect(result).toMatchObject({
    status: 'preview',
    previewToken: '40000000-0000-4000-8000-000000000011',
    preview: { invalidRows: [invalidRow] },
  });
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith('create_import_preview', {
    p_competence: '2026-09',
    p_valid_rows: [validRow],
  });
});

it('commits by token through commit_import without accepting client-edited rows', async () => {
  rpc.mockResolvedValue({ data: { processedRows: 4 }, error: null });
  const form = new FormData();
  form.set('previewToken', '40000000-0000-4000-8000-000000000011');
  form.set('validRows', JSON.stringify([{ document: 'client-edited' }]));

  const result = await commitImport({ status: 'idle' }, form);

  expect(result).toEqual({ status: 'committed', processedRows: 4 });
  expect(rpc).toHaveBeenCalledOnce();
  expect(rpc).toHaveBeenCalledWith('commit_import', {
    p_preview_token: '40000000-0000-4000-8000-000000000011',
  });
});

it('rejects unauthenticated preview requests before parsing the workbook', async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: null });
  const form = new FormData();

  const result = await previewImport({ status: 'idle' }, form);

  expect(result).toEqual({ status: 'error', message: 'Sessão inválida. Entre novamente.' });
  expect(parseWorkbook).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

import { confirmBatch } from './actions';

const boundary = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({ createClient: async () => ({ rpc: boundary.rpc, auth: { getUser: boundary.getUser } }) }));
const input = { competence: '2026-09', deviceId: '60000000-0000-4000-8000-000000000061', assessmentIds: ['40000000-0000-4000-8000-000000000061'] };
beforeEach(() => { vi.clearAllMocks(); boundary.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null }); });
it('returns field errors before contacting the database for invalid input', async () => {
  const result = await confirmBatch({ ...input, competence: '2026-13', assessmentIds: [] });
  expect(result.status).toBe('error');
  if (result.status === 'error') expect(result.fieldErrors?.assessmentIds).toBeDefined();
  expect(boundary.rpc).not.toHaveBeenCalled();
});
it('confirms through one atomic RPC and returns the verified summary', async () => {
  const summary = { batchId: input.deviceId, itemCount: 1, totalRevenueCents: 12345 };
  boundary.rpc.mockResolvedValue({ data: summary, error: null });
  expect(await confirmBatch(input)).toEqual({ status: 'success', summary });
  expect(boundary.rpc).toHaveBeenCalledExactlyOnceWith('confirm_batch', { p_competence: input.competence, p_device_id: input.deviceId, p_assessment_ids: input.assessmentIds });
});
it('rejects missing authentication without RPC', async () => {
  boundary.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect((await confirmBatch(input)).status).toBe('error');
  expect(boundary.rpc).not.toHaveBeenCalled();
});
it('rejects unsafe monetary totals from a malformed RPC response', async () => {
  boundary.rpc.mockResolvedValue({ data: { batchId: input.deviceId, itemCount: 1, totalRevenueCents: Number.MAX_SAFE_INTEGER + 1 }, error: null });
  expect((await confirmBatch(input)).status).toBe('error');
});
it('returns an actionable error when the transaction rejects selection', async () => {
  boundary.rpc.mockResolvedValue({ data: null, error: { code: '22023' } });
  const result = await confirmBatch(input);
  expect(result.status).toBe('error');
  if (result.status === 'error') expect(result.fieldErrors?.assessmentIds).toBeDefined();
});

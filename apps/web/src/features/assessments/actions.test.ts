import { createCompetence, updateAssessment } from './actions';
import { parseBrazilianCents } from './revenue';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({ createClient }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it.each([
  ['1.234,56', 123_456],
  ['R$ 2.000,00', 200_000],
  ['0,99', 99],
  ['100', 10_000],
])('parses Brazilian revenue %s into exact cents', (input, expected) => {
  expect(parseBrazilianCents(input)).toBe(expected);
});

it.each(['-1,00', '1,999', 'valor', ''])('rejects invalid revenue %s', (input) => {
  expect(parseBrazilianCents(input)).toBeNull();
});

it('creates zeroed assessments only for active Simples taxpayers with profiles', async () => {
  const upsert = vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: [{ id: 'new-one' }, { id: 'new-two' }], error: null }),
  });
  const from = vi.fn((table: string) => {
    if (table === 'taxpayer_obligations') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({
              data: [{ taxpayer_id: 'taxpayer-1' }, { taxpayer_id: 'taxpayer-2' }, { taxpayer_id: 'inactive' }],
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'taxpayers') {
      return {
        select: () => ({
          eq: () => ({
            in: () => Promise.resolve({
              data: [{ id: 'taxpayer-1' }, { id: 'taxpayer-2' }],
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'simple_profiles') {
      return {
        select: () => ({
          in: () => Promise.resolve({
            data: [{ taxpayer_id: 'taxpayer-1' }, { taxpayer_id: 'taxpayer-2' }],
            error: null,
          }),
        }),
      };
    }
    if (table === 'monthly_assessments') return { upsert };
    throw new Error(`unexpected table ${table}`);
  });
  createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null }) },
    from,
  });

  await expect(createCompetence('2026-09')).resolves.toEqual({ status: 'success', createdCount: 2 });
  expect(upsert).toHaveBeenCalledWith(
    [
      { taxpayer_id: 'taxpayer-1', obligation: 'simples', competence: '2026-09', revenue_cents: 0 },
      { taxpayer_id: 'taxpayer-2', obligation: 'simples', competence: '2026-09', revenue_cents: 0 },
    ],
    {
      onConflict: 'taxpayer_id,obligation,competence',
      ignoreDuplicates: true,
    },
  );
});

it('updates exact cents with the current row version and returns the next version', async () => {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'assessment-1', version: 5 }, error: null }),
          }),
        }),
      }),
    }),
  });
  const from = vi.fn((table: string) => {
    if (table === 'simple_profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { taxpayer_id: 'taxpayer-1' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'monthly_assessments') return { update };
    throw new Error(`unexpected table ${table}`);
  });
  createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null }) },
    from,
  });

  await expect(updateAssessment({
    assessmentId: '10000000-0000-4000-8000-000000000001',
    profileId: '30000000-0000-4000-8000-000000000001',
    version: 4,
    revenue: '1.234,56',
    selected: true,
  })).resolves.toEqual({ status: 'success', version: 5 });
  expect(update).toHaveBeenCalledWith({ revenue_cents: 123_456, selected: true, version: 5 });
});

it('returns a conflict when the optimistic update matches no current version', async () => {
  const maybeSingle = vi.fn()
    .mockResolvedValueOnce({ data: { taxpayer_id: 'taxpayer-1' }, error: null })
    .mockResolvedValueOnce({ data: null, error: null });
  const from = vi.fn((table: string) => {
    if (table === 'simple_profiles') {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    }
    return {
      update: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle }) }) }) }),
      }),
    };
  });
  createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null }) },
    from,
  });

  await expect(updateAssessment({
    assessmentId: '10000000-0000-4000-8000-000000000001',
    profileId: '30000000-0000-4000-8000-000000000001',
    version: 4,
    revenue: '1,00',
    selected: false,
  })).resolves.toEqual({
    status: 'conflict',
    message: 'Outra edição alterou esta linha. Recarregue a competência.',
  });
});

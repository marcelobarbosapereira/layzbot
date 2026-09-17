import { listAssessmentRows, listCompetences } from './queries';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('../../lib/supabase/server', () => ({ createClient }));

function filteredResult(data: unknown[]) {
  const result = Promise.resolve({ data, error: null });
  return {
    eq: vi.fn(() => ({ eq: vi.fn(() => result) })),
    in: vi.fn(() => result),
    order: vi.fn(() => result),
  };
}

it('maps owner-visible assessment data into grid rows without exposing unrelated fields', async () => {
  const from = vi.fn((table: string) => {
    if (table === 'monthly_assessments') {
      return {
        select: () => filteredResult([{
          id: 'assessment-1', taxpayer_id: 'taxpayer-1', revenue_cents: 12345,
          selected: true, status: 'pending', version: 2,
        }]),
      };
    }
    if (table === 'taxpayers') {
      return { select: () => filteredResult([{
        id: 'taxpayer-1', name: 'Empresa Fabricada', document: '11222333000181',
        responsible_id: 'responsible-1', active: true,
      }]) };
    }
    if (table === 'simple_profiles') {
      return { select: () => filteredResult([{
        id: 'profile-1', taxpayer_id: 'taxpayer-1', activity: 'commerce',
      }]) };
    }
    if (table === 'responsibles') {
      return { select: () => filteredResult([{ id: 'responsible-1', name: 'Pessoa Fabricada' }]) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  createClient.mockResolvedValue({ from });

  await expect(listAssessmentRows('2026-09')).resolves.toEqual([{
    id: 'assessment-1',
    taxpayerId: 'taxpayer-1',
    profileId: 'profile-1',
    companyName: 'Empresa Fabricada',
    document: '11222333000181',
    revenueCents: 12345,
    activity: 'commerce',
    responsible: 'Pessoa Fabricada',
    status: 'pending',
    documentsCount: 0,
    selected: true,
    version: 2,
  }]);
});

it('returns unique competences newest first', async () => {
  createClient.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [{ competence: '2026-09' }, { competence: '2026-09' }, { competence: '2026-08' }],
            error: null,
          }),
        }),
      }),
    }),
  });

  await expect(listCompetences()).resolves.toEqual(['2026-09', '2026-08']);
});

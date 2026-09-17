import { createClient } from '../../lib/supabase/server';
import type { AssessmentRow } from './assessment-grid';

function requireData<T>(result: { data: T | null; error: unknown }, message: string): T {
  if (result.error || result.data === null) throw new Error(message);
  return result.data;
}

export async function listAssessmentRows(competence: string): Promise<AssessmentRow[]> {
  const supabase = await createClient();
  const assessments = requireData(await supabase
    .from('monthly_assessments')
    .select('id,taxpayer_id,revenue_cents,selected,status,version')
    .eq('obligation', 'simples')
    .eq('competence', competence), 'Não foi possível carregar as apurações.');

  const taxpayerIds = assessments.map(({ taxpayer_id }) => taxpayer_id);
  if (taxpayerIds.length === 0) return [];

  const taxpayers = requireData(await supabase
    .from('taxpayers')
    .select('id,name,document,responsible_id,active')
    .in('id', taxpayerIds), 'Não foi possível carregar as empresas.');
  const profiles = requireData(await supabase
    .from('simple_profiles')
    .select('id,taxpayer_id,activity')
    .in('taxpayer_id', taxpayerIds), 'Não foi possível carregar os perfis do Simples.');
  const responsibleIds = taxpayers.map(({ responsible_id }) => responsible_id);
  const responsibles = requireData(await supabase
    .from('responsibles')
    .select('id,name')
    .in('id', responsibleIds), 'Não foi possível carregar os responsáveis.');

  const taxpayerById = new Map(taxpayers.filter(({ active }) => active).map((row) => [row.id, row]));
  const profileByTaxpayer = new Map(profiles.map((row) => [row.taxpayer_id, row]));
  const responsibleById = new Map(responsibles.map((row) => [row.id, row]));

  return assessments.flatMap((assessment) => {
    const taxpayer = taxpayerById.get(assessment.taxpayer_id);
    const profile = profileByTaxpayer.get(assessment.taxpayer_id);
    if (!taxpayer || !profile) return [];
    return [{
      id: assessment.id,
      taxpayerId: assessment.taxpayer_id,
      profileId: profile.id,
      companyName: taxpayer.name,
      document: taxpayer.document,
      revenueCents: Number(assessment.revenue_cents),
      activity: profile.activity as AssessmentRow['activity'],
      responsible: responsibleById.get(taxpayer.responsible_id)?.name ?? 'Não informado',
      status: assessment.status,
      documentsCount: 0,
      selected: assessment.selected,
      version: assessment.version,
    }];
  });
}

export async function listCompetences(): Promise<string[]> {
  const supabase = await createClient();
  const rows = requireData(await supabase
    .from('monthly_assessments')
    .select('competence')
    .eq('obligation', 'simples')
    .order('competence', { ascending: false }), 'Não foi possível carregar as competências.');
  return [...new Set(rows.map(({ competence }) => competence))];
}

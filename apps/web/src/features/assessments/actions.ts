'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '../../lib/supabase/server';
import { parseBrazilianCents } from './revenue';

const competenceSchema = z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);
const updateSchema = z.object({
  assessmentId: z.string().uuid(),
  profileId: z.string().uuid(),
  version: z.number().int().positive(),
  revenue: z.string(),
  selected: z.boolean(),
});

export type AssessmentMutationInput = z.infer<typeof updateSchema>;
export type AssessmentMutationResult =
  | { status: 'success'; version: number }
  | { status: 'error' | 'conflict'; message: string };
export type CompetenceCreationResult =
  | { status: 'success'; createdCount: number }
  | { status: 'error'; message: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return error || !user ? null : supabase;
}

export async function createCompetence(yyyyMm: string): Promise<CompetenceCreationResult> {
  const competence = competenceSchema.safeParse(yyyyMm);
  if (!competence.success) return { status: 'error', message: 'Competência inválida.' };

  const supabase = await authenticatedClient();
  if (!supabase) return { status: 'error', message: 'Sessão inválida. Entre novamente.' };

  const { data: obligations, error: obligationsError } = await supabase
    .from('taxpayer_obligations')
    .select('taxpayer_id')
    .eq('obligation', 'simples')
    .eq('active', true);
  if (obligationsError) return { status: 'error', message: 'Não foi possível criar a competência.' };

  const obligationIds = [...new Set((obligations ?? []).map(({ taxpayer_id }) => taxpayer_id))];
  if (obligationIds.length === 0) return { status: 'success', createdCount: 0 };

  const { data: taxpayers, error: taxpayersError } = await supabase
    .from('taxpayers')
    .select('id')
    .eq('active', true)
    .in('id', obligationIds);
  if (taxpayersError) return { status: 'error', message: 'Não foi possível criar a competência.' };

  const activeIds = (taxpayers ?? []).map(({ id }) => id);
  if (activeIds.length === 0) return { status: 'success', createdCount: 0 };

  const { data: profiles, error: profilesError } = await supabase
    .from('simple_profiles')
    .select('taxpayer_id')
    .in('taxpayer_id', activeIds);
  if (profilesError) return { status: 'error', message: 'Não foi possível criar a competência.' };

  const assessments = (profiles ?? []).map(({ taxpayer_id }) => ({
    taxpayer_id,
    obligation: 'simples' as const,
    competence: competence.data,
    revenue_cents: 0,
  }));
  if (assessments.length === 0) return { status: 'success', createdCount: 0 };

  const { data: inserted, error: insertError } = await supabase
    .from('monthly_assessments')
    .upsert(assessments, {
      onConflict: 'taxpayer_id,obligation,competence',
      ignoreDuplicates: true,
    })
    .select('id');
  if (insertError) return { status: 'error', message: 'Não foi possível criar a competência.' };

  revalidatePath('/simples');
  return { status: 'success', createdCount: inserted?.length ?? 0 };
}

export async function updateAssessment(input: AssessmentMutationInput): Promise<AssessmentMutationResult> {
  const parsed = updateSchema.safeParse(input);
  const revenueCents = parsed.success ? parseBrazilianCents(parsed.data.revenue) : null;
  if (!parsed.success || revenueCents === null) {
    return { status: 'error', message: 'Receita inválida' };
  }

  const supabase = await authenticatedClient();
  if (!supabase) return { status: 'error', message: 'Sessão inválida. Entre novamente.' };

  const { data: profile, error: profileError } = await supabase
    .from('simple_profiles')
    .select('taxpayer_id')
    .eq('id', parsed.data.profileId)
    .maybeSingle();
  if (profileError || !profile) {
    return { status: 'error', message: 'Perfil do Simples não encontrado.' };
  }

  const nextVersion = parsed.data.version + 1;
  const { data: updated, error: updateError } = await supabase
    .from('monthly_assessments')
    .update({
      revenue_cents: revenueCents,
      selected: parsed.data.selected,
      version: nextVersion,
    })
    .eq('id', parsed.data.assessmentId)
    .eq('taxpayer_id', profile.taxpayer_id)
    .eq('version', parsed.data.version)
    .select('id,version')
    .maybeSingle();

  if (updateError) return { status: 'error', message: 'Não foi possível salvar a apuração.' };
  if (!updated) {
    return {
      status: 'conflict',
      message: 'Outra edição alterou esta linha. Recarregue a competência.',
    };
  }

  revalidatePath('/simples');
  return { status: 'success', version: updated.version };
}

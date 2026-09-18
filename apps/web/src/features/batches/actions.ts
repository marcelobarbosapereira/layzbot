'use server';

import { batchSummary, confirmBatchInput, type ConfirmBatchResult } from '@lazybot/contracts';
import { createClient } from '../../lib/supabase/server';

export async function confirmBatch(input: unknown): Promise<ConfirmBatchResult> {
  const parsed = confirmBatchInput.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'Revise os campos do lote.', fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { status: 'error', message: 'Sessão inválida. Entre novamente.' };
  const { data, error } = await supabase.rpc('confirm_batch', {
    p_competence: parsed.data.competence,
    p_device_id: parsed.data.deviceId,
    p_assessment_ids: parsed.data.assessmentIds,
  });
  if (error) return {
    status: 'error', message: 'Não foi possível confirmar. Atualize a seleção e verifique o dispositivo e os perfis ativos.',
    fieldErrors: error.code === '22023' ? { assessmentIds: ['Revise as apurações selecionadas.'], deviceId: ['Verifique se o dispositivo está online.'] } : undefined,
  };
  const summary = batchSummary.safeParse(data);
  if (!summary.success) return { status: 'error', message: 'Resposta inesperada. Confira os lotes antes de tentar novamente.' };
  return { status: 'success', summary: summary.data };
}

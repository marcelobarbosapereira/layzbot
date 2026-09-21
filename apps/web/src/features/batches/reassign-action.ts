'use server';

import { z } from 'zod';
import { createClient } from '../../lib/supabase/server';

const inputSchema = z.object({ batchId: z.string().uuid(), targetDeviceId: z.string().uuid() });
const responseSchema = z.object({ reassignedCount: z.number().int().nonnegative() });
export type ReassignResult = { status: 'success'; reassignedCount: number } | { status: 'error'; message: string };

export async function reassignBatchItems(input: unknown): Promise<ReassignResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: 'error', message: 'Selecione um lote e dispositivo válidos.' };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { status: 'error', message: 'Sessão inválida. Entre novamente.' };
  const { data, error } = await supabase.rpc('reassign_batch_items', {
    p_batch_id: parsed.data.batchId, p_target_device_id: parsed.data.targetDeviceId,
  });
  if (error || !data || typeof data !== 'object') return { status: 'error', message: 'Não foi possível reatribuir os itens.' };
  if (data.error === 'SOURCE_ONLINE') return { status: 'error', message: 'O dispositivo atual ainda está online.' };
  if (data.error === 'TARGET_UNAVAILABLE') return { status: 'error', message: 'O novo dispositivo não está disponível.' };
  if (data.error) return { status: 'error', message: 'O lote não está disponível para reatribuição.' };
  const result = responseSchema.safeParse(data);
  return result.success ? { status: 'success', reassignedCount: result.data.reassignedCount } : { status: 'error', message: 'Resposta inesperada da reatribuição.' };
}

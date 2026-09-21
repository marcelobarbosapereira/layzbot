import { createClient } from '../../lib/supabase/server';
import { listDevices } from '../devices/actions';
import type { BatchEventView, BatchItemView } from './batch-progress';

export async function getBatchProgress(batchId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;
  const { data: batch, error: batchError } = await supabase.from('batches')
    .select('id,competence,device_id').eq('id', batchId).single();
  if (batchError || !batch) return null;
  const { data: itemRows, error: itemError } = await supabase.from('batch_items')
    .select('id,batch_id,taxpayer_name,status,assigned_device_id,lease_expires_at').eq('batch_id', batchId).order('created_at');
  if (itemError || !itemRows) return null;
  const [{ data: eventRows, error: eventError }, { data: artifactRows, error: artifactError }, devices] = await Promise.all([
    supabase.from('batch_item_events').select('id,batch_id,batch_item_id,next_state,message,created_at,actor_user_id').eq('batch_id', batchId).order('id'),
    supabase.from('artifacts').select('id,batch_item_id,original_name,object_path').in('batch_item_id', itemRows.map((item) => item.id)),
    listDevices(),
  ]);
  if (eventError || artifactError || !eventRows || !artifactRows) return null;
  const signed = await Promise.all(artifactRows.map(async (row) => {
    const { data } = await supabase.storage.from('fiscal-documents').createSignedUrl(row.object_path, 3600);
    return { id: row.id as string, batchItemId: row.batch_item_id as string, name: row.original_name as string, url: data?.signedUrl ?? null };
  }));
  const items: BatchItemView[] = itemRows.map((row) => ({
    id: row.id, batchId: row.batch_id, taxpayerName: row.taxpayer_name, status: row.status,
    assignedDeviceId: row.assigned_device_id ?? batch.device_id, leaseExpiresAt: row.lease_expires_at,
    artifacts: signed.filter((artifact) => artifact.batchItemId === row.id && artifact.url).map((artifact) => ({ id: artifact.id, name: artifact.name, url: artifact.url! })),
  }));
  const events: BatchEventView[] = eventRows.map((row) => ({ id: Number(row.id), batchId: row.batch_id, batchItemId: row.batch_item_id, nextState: row.next_state, message: row.message, createdAt: row.created_at, actorUserId: row.actor_user_id }));
  return { batch: { id: batch.id, competence: batch.competence, deviceId: batch.device_id }, items, events, devices };
}

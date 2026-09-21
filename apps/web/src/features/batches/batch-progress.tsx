'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useRef, useState, useTransition } from 'react';
import { reassignBatchItems } from './reassign-action';

export type BatchItemView = { id: string; batchId: string; taxpayerName: string; status: string; assignedDeviceId: string; leaseExpiresAt: string | null; artifacts: { id: string; name: string; url: string }[] };
export type BatchEventView = { id: number; batchId: string; batchItemId: string; nextState: string; message: string; createdAt: string; actorUserId: string | null };
type DeviceView = { id: string; name: string; online: boolean; revokedAt: string | null };
type Subscribe = (batchId: string, onItem: (item: BatchItemView) => void, onEvent: (event: BatchEventView) => void) => () => void;
type Reassign = (input: { batchId: string; targetDeviceId: string }) => Promise<{ status: 'success'; reassignedCount: number } | { status: 'error'; message: string }>;

const labels: Record<string, string> = { pending: 'Pendente', authenticating: 'Autenticando', transmitting: 'Em transmissão', awaiting_result: 'Aguardando resultado', submitted: 'Enviado', das_downloaded: 'DAS baixado', completed: 'Concluído', needs_attention: 'Precisa de atenção', failed: 'Falhou', interrupted: 'Interrompido' };
const safeStates = new Set(['pending', 'needs_attention', 'failed', 'interrupted']);

function defaultSubscribe(batchId: string, onItem: (item: BatchItemView) => void, onEvent: (event: BatchEventView) => void) {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const channel = client.channel(`batch-progress-${batchId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'batch_items', filter: `batch_id=eq.${batchId}` }, ({ new: row }) => {
      onItem({ id: String(row.id), batchId: String(row.batch_id), taxpayerName: String(row.taxpayer_name), status: String(row.status), assignedDeviceId: String(row.assigned_device_id ?? ''), leaseExpiresAt: typeof row.lease_expires_at === 'string' ? row.lease_expires_at : null, artifacts: [] });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'batch_item_events', filter: `batch_id=eq.${batchId}` }, ({ new: row }) => {
      onEvent({ id: Number(row.id), batchId: String(row.batch_id), batchItemId: String(row.batch_item_id), nextState: String(row.next_state), message: String(row.message), createdAt: String(row.created_at), actorUserId: typeof row.actor_user_id === 'string' ? row.actor_user_id : null });
    })
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

export function BatchProgress({ batch, initialItems, initialEvents, devices, subscribe = defaultSubscribe, onReassign = reassignBatchItems }: {
  batch: { id: string; competence: string; deviceId: string }; initialItems: BatchItemView[]; initialEvents: BatchEventView[]; devices: DeviceView[]; subscribe?: Subscribe; onReassign?: Reassign;
}) {
  const [items, setItems] = useState(initialItems);
  const [events, setEvents] = useState(initialEvents);
  const [targetDeviceId, setTargetDeviceId] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();
  const latestEventIds = useRef(new Map(initialEvents.map((event) => [event.batchItemId, event.id] as const)));
  useEffect(() => subscribe(batch.id,
    (incoming) => setItems((current) => current.map((item) => item.id === incoming.id ? { ...item, ...incoming, assignedDeviceId: incoming.assignedDeviceId || item.assignedDeviceId, artifacts: item.artifacts } : item)),
    (incoming) => {
      const latest = latestEventIds.current.get(incoming.batchItemId) ?? 0;
      if (incoming.id <= latest) return;
      latestEventIds.current.set(incoming.batchItemId, incoming.id);
      setEvents((current) => [...current, incoming]);
      setItems((current) => current.map((item) => item.id === incoming.batchItemId ? { ...item, status: incoming.nextState } : item));
    },
  ), [batch.id, subscribe]);
  const count = (status: string) => items.filter((item) => item.status === status).length;
  const eligible = items.filter((item) => safeStates.has(item.status));
  const canReassign = eligible.some((item) => {
    const current = devices.find((device) => device.id === item.assignedDeviceId);
    return current != null && (!current.online || current.revokedAt !== null);
  });
  const targetDevices = devices.filter((device) => device.online && !device.revokedAt);
  return <section aria-label={`Execução ${batch.competence}`}>
    <h1>Execução {batch.competence}</h1>
    <div aria-label="Progresso do lote">
      <span>Concluídos: {count('completed')}</span>{' · '}
      <span>Atenção: {count('needs_attention')}</span>{' · '}
      <span>Falhas: {count('failed')}</span>{' · '}
      <span>Interrompidos: {count('interrupted')}</span>
    </div>
    <ul aria-label="Itens da execução">{items.map((item) => <li key={item.id}>
      <h2>{item.taxpayerName}</h2><p>{labels[item.status] ?? item.status}</p>
      {item.status === 'needs_attention' && <aside>
        <p>Intervenção: {events.filter((event) => event.batchItemId === item.id).sort((a, b) => b.id - a.id)[0]?.message ?? 'Verifique a execução.'}</p>
        <p>Ação recomendada: confira a pendência antes de retomar o item.</p>
      </aside>}
      {item.artifacts.length > 0 && <ul aria-label={`Documentos de ${item.taxpayerName}`}>{item.artifacts.map((artifact) => <li key={artifact.id}><a href={artifact.url}>{artifact.name}</a></li>)}</ul>}
      <ol aria-label={`Histórico de ${item.taxpayerName}`}>{events.filter((event) => event.batchItemId === item.id).sort((a, b) => a.id - b.id).map((event) => <li key={event.id}><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('pt-BR')}</time>{' — '}{event.message}</li>)}</ol>
    </li>)}</ul>
    {canReassign && <div>
      <label>Novo dispositivo <select value={targetDeviceId} onChange={(event) => setTargetDeviceId(event.target.value)}><option value="">Selecione</option>{targetDevices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>
      <button type="button" disabled={pending || !targetDeviceId} onClick={() => startTransition(async () => {
        try {
          const result = await onReassign({ batchId: batch.id, targetDeviceId });
          setNotice(result.status === 'success' ? `${result.reassignedCount} itens reatribuídos.` : result.message);
        } catch { setNotice('Não foi possível reatribuir os itens.'); }
      })}>Reatribuir itens seguros</button>
    </div>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}

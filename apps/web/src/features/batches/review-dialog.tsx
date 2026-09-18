'use client';

import { useRef, useState } from 'react';
import type { ConfirmBatchInput, ConfirmBatchResult } from '@lazybot/contracts';
import { confirmBatch } from './actions';

export type BatchReviewRow = { id: string; companyName: string; revenueCents: number | null; responsible: string; blockedReason: string | null };
export type BatchReviewDevice = { id: string; name: string; online: boolean; certificateAvailable: boolean; lastSuccessfulAt: string | null };

export function BatchReviewDialog({ competence, rows, devices, onConfirm = confirmBatch }: {
  competence: string; rows: BatchReviewRow[]; devices: BatchReviewDevice[];
  onConfirm?: (input: ConfirmBatchInput) => Promise<ConfirmBatchResult>;
}) {
  const [deviceId, setDeviceId] = useState(() => [...devices].filter((device) => device.online)
    .sort((a, b) => (b.lastSuccessfulAt ?? '').localeCompare(a.lastSuccessfulAt ?? ''))[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ConfirmBatchResult | null>(null);
  const submitting = useRef(false);
  const device = devices.find((item) => item.id === deviceId);
  const blocked = rows.filter((row) => row.blockedReason || row.revenueCents === null || !Number.isSafeInteger(row.revenueCents) || row.revenueCents < 0);
  const total = rows.reduce((sum, row) => sum + (row.revenueCents ?? 0), 0);
  const disabled = pending || result?.status === 'success' || !rows.length || blocked.length > 0 || !Number.isSafeInteger(total) || !device?.online || !device.certificateAvailable;
  async function submit() {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setPending(true);
    try { setResult(await onConfirm({ competence, deviceId, assessmentIds: rows.map((row) => row.id) })); }
    catch { setResult({ status: 'error', message: 'Falha de conexão. Confira os lotes antes de tentar novamente.' }); }
    finally { submitting.current = false; setPending(false); }
  }
  return <section role="dialog" aria-modal="true" aria-labelledby="batch-review-title">
    <h2 id="batch-review-title">Revisar lote</h2>
    <p>Competência: <span>{competence}</span></p>
    <p>Empresas: {rows.length}</p>
    <p>Receita total: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total / 100)}</p>
    <p>Responsáveis: <span>{[...new Set(rows.map((row) => row.responsible))].join(', ')}</span></p>
    <p>Linhas bloqueadas: {blocked.length}</p>
    <ul>{blocked.map((row) => <li key={row.id}>{row.companyName}: {row.blockedReason ?? 'Receita inválida'}</li>)}</ul>
    <label>Dispositivo executor<select value={deviceId} onChange={(event) => setDeviceId(event.target.value)} disabled={pending || result?.status === 'success'}>
      <option value="">Selecione um dispositivo</option>
      {devices.map((item) => <option key={item.id} value={item.id} disabled={!item.online}>{item.name}{!item.online ? ' (offline)' : ''}</option>)}
    </select></label>
    <p>{device?.certificateAvailable ? 'Certificado disponível' : 'Certificado indisponível'}</p>
    {result?.status === 'error' && <p role="alert">{result.message}</p>}
    {result?.status === 'success' && <p role="status">Lote confirmado: {result.summary.batchId}</p>}
    <button type="button" disabled={disabled} onClick={submit}>Confirmar e executar</button>
    {pending && <p role="status">Confirmando…</p>}
  </section>;
}

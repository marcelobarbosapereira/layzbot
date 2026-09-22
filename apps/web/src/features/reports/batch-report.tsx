'use client';

export type BatchReportItem = {
  id: string;
  companyName: string;
  status: 'pending' | 'authenticating' | 'profile_selected' | 'assessment_filled' | 'calculated' | 'transmitting' | 'awaiting_result' | 'submitted' | 'das_downloaded' | 'completed' | 'needs_attention' | 'failed' | 'interrupted';
  lastSafeState: string;
  action: string;
  retryEligible: boolean;
  dasUrl?: string;
  receiptUrl?: string;
};

const labels: Record<string, string> = { completed: 'Concluído', needs_attention: 'Precisa de atenção', failed: 'Falhou', interrupted: 'Interrompido' };
const terminal = new Set(['completed', 'needs_attention', 'failed', 'interrupted']);

export function BatchReport({ batchId, items }: { batchId: string; items: BatchReportItem[] }) {
  const count = (status: string) => items.filter((item) => item.status === status).length;
  const complete = items.every((item) => terminal.has(item.status));
  return <section aria-label={`Relatório do lote ${batchId}`}>
    <h1>Relatório operacional</h1>
    <p aria-label="Resumo do lote" role="status">{complete ? 'Lote concluído' : 'Lote pendente: há itens não terminais'}</p>
    <div aria-label="Totais do lote">
      <span>Concluídos: {count('completed')}</span>{' · '}
      <span>Precisa de atenção: {count('needs_attention')}</span>{' · '}
      <span>Falhas: {count('failed')}</span>{' · '}
      <span>Interrompidos: {count('interrupted')}</span>
    </div>
    <ul aria-label="Itens do lote">{items.map((item) => <li key={item.id}>
      <h2>{item.companyName}</h2>
      <p>Estado: {labels[item.status] ?? item.status}</p>
      <p>Último estado seguro: {item.lastSafeState}</p>
      <p>Ação: {item.action}</p>
      {item.retryEligible && <p>Retentativa elegível</p>}
      {item.dasUrl && <a href={item.dasUrl}>DAS de {item.companyName}</a>}
      {item.receiptUrl && <a href={item.receiptUrl}>Recibo de {item.companyName}</a>}
    </li>)}</ul>
  </section>;
}

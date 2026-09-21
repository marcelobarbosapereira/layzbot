import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BatchProgress, type BatchItemView, type BatchEventView } from './batch-progress';

const batchId = '60000000-0000-4000-8000-000000000091';
const deviceA = '60000000-0000-4000-8000-000000000092';
const deviceB = '60000000-0000-4000-8000-000000000093';
const item = (id: string, status: string): BatchItemView => ({ id, batchId, taxpayerName: `Empresa ${id.slice(-2)}`, status, assignedDeviceId: deviceA, leaseExpiresAt: null, artifacts: [] });
const items = [item('60000000-0000-4000-8000-000000000001', 'completed'), item('60000000-0000-4000-8000-000000000002', 'needs_attention'), item('60000000-0000-4000-8000-000000000003', 'failed'), item('60000000-0000-4000-8000-000000000004', 'interrupted')];
const devices = [{ id: deviceA, name: 'Executor antigo', online: false, revokedAt: null }, { id: deviceB, name: 'Executor novo', online: true, revokedAt: null }];

it('shows distinct completed, attention, failed, and interrupted totals', () => {
  render(<BatchProgress batch={{ id: batchId, competence: '2026-09', deviceId: deviceA }} initialItems={items} initialEvents={[]} devices={devices} subscribe={() => () => {}} />);
  expect(screen.getByText('Concluídos: 1')).toBeInTheDocument();
  expect(screen.getByText('Atenção: 1')).toBeInTheDocument();
  expect(screen.getByText('Falhas: 1')).toBeInTheDocument();
  expect(screen.getByText('Interrompidos: 1')).toBeInTheDocument();
});

it('applies a live item and event once, updating its row without refresh', () => {
  let onItem!: (item: BatchItemView) => void;
  let onEvent!: (event: BatchEventView) => void;
  render(<BatchProgress batch={{ id: batchId, competence: '2026-09', deviceId: deviceA }} initialItems={[item('60000000-0000-4000-8000-000000000001', 'pending')]} initialEvents={[]} devices={devices} subscribe={(_id, update, event) => { onItem = update; onEvent = event; return () => {}; }} />);
  const event: BatchEventView = { id: 7, batchId, batchItemId: '60000000-0000-4000-8000-000000000001', nextState: 'transmitting', message: 'Transmitindo', createdAt: '2026-09-21T10:00:00Z', actorUserId: null };
  act(() => { onItem({ ...item(event.batchItemId, 'transmitting'), leaseExpiresAt: '2026-09-21T10:01:00Z' }); onEvent(event); onEvent(event); });
  expect(screen.getByText('Em transmissão')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Histórico de Empresa 01' }).querySelectorAll('li')).toHaveLength(1);
  expect(screen.getByRole('list', { name: 'Histórico de Empresa 01' })).toHaveTextContent('Transmitindo');
});

it('offers explicit reassignment only for safe incomplete states', async () => {
  const reassign = vi.fn().mockResolvedValue({ status: 'success', reassignedCount: 3 });
  render(<BatchProgress batch={{ id: batchId, competence: '2026-09', deviceId: deviceA }} initialItems={[...items, item('60000000-0000-4000-8000-000000000005', 'submitted'), item('60000000-0000-4000-8000-000000000006', 'das_downloaded')]} initialEvents={[]} devices={devices} onReassign={reassign} subscribe={() => () => {}} />);
  fireEvent.change(screen.getByLabelText('Novo dispositivo'), { target: { value: deviceB } });
  fireEvent.click(screen.getByRole('button', { name: 'Reatribuir itens seguros' }));
  await waitFor(() => expect(screen.getByText(/3 itens reatribuídos/)).toBeInTheDocument());
  expect(reassign).toHaveBeenCalledWith({ batchId, targetDeviceId: deviceB });
  expect(screen.getByText('Enviado')).toBeInTheDocument();
  expect(screen.getByText('DAS baixado')).toBeInTheDocument();
});

it('shows the intervention message and authorized document link on the affected item', () => {
  const affected = { ...item('60000000-0000-4000-8000-000000000001', 'needs_attention'), artifacts: [{ id: 'doc-1', name: 'Evidência.png', url: 'https://example.test/signed' }] };
  const event: BatchEventView = { id: 8, batchId, batchItemId: affected.id, nextState: 'needs_attention', message: 'Procuração expirada', createdAt: '2026-09-21T10:00:00Z', actorUserId: null };
  render(<BatchProgress batch={{ id: batchId, competence: '2026-09', deviceId: deviceA }} initialItems={[affected]} initialEvents={[event]} devices={devices} subscribe={() => () => {}} />);
  expect(screen.getByText('Intervenção: Procuração expirada')).toBeInTheDocument();
  expect(screen.getByText(/Ação recomendada:/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Evidência.png' })).toHaveAttribute('href', 'https://example.test/signed');
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BatchReviewDialog } from './review-dialog';

const deviceId = '60000000-0000-4000-8000-000000000061';
const rows = [{ id: '40000000-0000-4000-8000-000000000061', companyName: 'Empresa teste', revenueCents: 12345, responsible: 'Responsável teste', blockedReason: null }];
const devices = [{ id: deviceId, name: 'Executor online', online: true, certificateAvailable: true, lastSuccessfulAt: '2026-09-17T10:00:00Z' }, { id: '60000000-0000-4000-8000-000000000062', name: 'Outro executor', online: true, certificateAvailable: false, lastSuccessfulAt: null }];

it('shows review totals and keeps the preselected last successful online device editable', () => {
  render(<BatchReviewDialog competence="2026-09" rows={rows} devices={devices} />);
  expect(screen.getByText('2026-09')).toBeInTheDocument();
  expect(screen.getByText(/123,45/)).toBeInTheDocument();
  expect(screen.getByText('Responsável teste')).toBeInTheDocument();
  expect(screen.getByLabelText('Dispositivo executor')).toHaveValue(deviceId);
  fireEvent.change(screen.getByLabelText('Dispositivo executor'), { target: { value: devices[1].id } });
  expect(screen.getByText(/Certificado indisponível/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar e executar' })).toBeDisabled();
});

it('calls confirmation once while pending and remains confirmed after success', async () => {
  let resolve!: (value: { status: 'success'; summary: { batchId: string; itemCount: number; totalRevenueCents: number } }) => void;
  const confirm = vi.fn(() => new Promise<{ status: 'success'; summary: { batchId: string; itemCount: number; totalRevenueCents: number } }>((done) => { resolve = done; }));
  render(<BatchReviewDialog competence="2026-09" rows={rows} devices={devices} onConfirm={confirm} />);
  const button = screen.getByRole('button', { name: 'Confirmar e executar' });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(confirm).toHaveBeenCalledWith({ competence: '2026-09', deviceId, assessmentIds: [rows[0].id] });
  resolve({ status: 'success', summary: { batchId: deviceId, itemCount: 1, totalRevenueCents: 12345 } });
  await waitFor(() => expect(screen.getByText(/Lote confirmado/)).toBeInTheDocument());
  expect(button).toBeDisabled();
});

it('shows blocked rows and prevents confirmation', () => {
  render(<BatchReviewDialog competence="2026-09" rows={[{ ...rows[0], blockedReason: 'Perfil inativo' }]} devices={devices} />);
  expect(screen.getByText(/Perfil inativo/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar e executar' })).toBeDisabled();
});
it('does not preselect a recently successful offline device', () => {
  render(<BatchReviewDialog competence="2026-09" rows={rows} devices={[{ ...devices[0], online: false }, devices[1]]} />);
  expect(screen.getByLabelText('Dispositivo executor')).toHaveValue(devices[1].id);
  expect(screen.getByRole('option', { name: /offline/ })).toBeDisabled();
});

it('allows retry after an action failure', async () => {
  const confirm = vi.fn().mockRejectedValue(new Error('Network'));
  render(<BatchReviewDialog competence="2026-09" rows={rows} devices={devices} onConfirm={confirm} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e executar' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Confirmar e executar' })).toBeEnabled();
});

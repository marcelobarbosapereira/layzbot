import { render, screen } from '@testing-library/react';
import { BatchReport, type BatchReportItem } from './batch-report';

const item = (id: string, status: BatchReportItem['status'], overrides: Partial<BatchReportItem> = {}): BatchReportItem => ({
  id, companyName: `Empresa ${id}`, status, lastSafeState: status, action: 'Nenhuma ação pendente', retryEligible: false, ...overrides,
});

it('shows operational totals and does not mark a batch complete with a nonterminal item', () => {
  render(<BatchReport batchId="batch-1" items={[item('a', 'completed'), item('b', 'needs_attention', { action: 'Confira a autorização' }), item('c', 'failed', { retryEligible: true }), item('d', 'pending')]} />);
  expect(screen.getByText('Concluídos: 1')).toBeInTheDocument();
  expect(screen.getByText('Precisa de atenção: 1')).toBeInTheDocument();
  expect(screen.getByText('Falhas: 1')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Lote pendente');
  expect(screen.getByText(/Ação: Confira a autorização/)).toBeInTheDocument();
});

it('exposes document links and retry eligibility for each company', () => {
  render(<BatchReport batchId="batch-2" items={[item('ok', 'completed', { dasUrl: '/das.pdf', receiptUrl: '/receipt.pdf' }), item('bad', 'failed', { retryEligible: true, action: 'Retome após corrigir' })]} />);
  expect(screen.getByRole('link', { name: 'DAS de Empresa ok' })).toHaveAttribute('href', '/das.pdf');
  expect(screen.getByRole('link', { name: 'Recibo de Empresa ok' })).toHaveAttribute('href', '/receipt.pdf');
  expect(screen.getByText('Retentativa elegível')).toBeInTheDocument();
});

it('marks an all-terminal batch complete', () => {
  render(<BatchReport batchId="batch-3" items={[item('a', 'completed'), item('b', 'interrupted')]} />);
  expect(screen.getByRole('status')).toHaveTextContent('Lote concluído');
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AssessmentGrid, type AssessmentRow } from './assessment-grid';
import { CompetencePicker } from './competence-picker';

const rows: AssessmentRow[] = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    taxpayerId: '20000000-0000-4000-8000-000000000001',
    profileId: '30000000-0000-4000-8000-000000000001',
    companyName: 'Empresa Visível Um',
    document: '11222333000181',
    revenueCents: 10_000,
    activity: 'commerce',
    responsible: 'Responsável Um',
    status: 'pending',
    documentsCount: 0,
    selected: false,
    version: 1,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    taxpayerId: '20000000-0000-4000-8000-000000000002',
    profileId: '30000000-0000-4000-8000-000000000002',
    companyName: 'Empresa Visível Dois',
    document: '45678912000134',
    revenueCents: 20_000,
    activity: 'services',
    responsible: 'Responsável Dois',
    status: 'pending',
    documentsCount: 1,
    selected: true,
    version: 3,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    taxpayerId: '20000000-0000-4000-8000-000000000003',
    profileId: '30000000-0000-4000-8000-000000000003',
    companyName: 'Empresa Oculta',
    document: '98765432000198',
    revenueCents: 30_000,
    activity: 'services',
    responsible: 'Responsável Três',
    status: 'completed',
    documentsCount: 2,
    selected: false,
    version: 2,
  },
];

it('shows Receita inválida and does not persist a negative revenue', () => {
  const update = vi.fn();
  render(<AssessmentGrid rows={rows} competence="2026-08" onUpdate={update} />);

  const revenue = screen.getByRole('textbox', { name: 'Receita de Empresa Visível Um' });
  fireEvent.change(revenue, { target: { value: '-1,00' } });
  fireEvent.blur(revenue);

  expect(screen.getByText('Receita inválida')).toBeVisible();
  expect(update).not.toHaveBeenCalled();
});

it('keeps the previous competence available after creating a new one', async () => {
  const create = vi.fn().mockResolvedValue({ status: 'success' as const });
  render(
    <CompetencePicker
      currentCompetence="2026-08"
      competences={['2026-08']}
      onCreate={create}
    />,
  );

  fireEvent.change(screen.getByLabelText('Nova competência'), { target: { value: '2026-09' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar competência' }));

  await waitFor(() => expect(create).toHaveBeenCalledWith('2026-09'));
  expect(screen.getByRole('link', { name: 'ago. de 2026' })).toHaveAttribute(
    'href',
    '?competence=2026-08',
  );
  expect(screen.getByRole('link', { name: 'set. de 2026' })).toHaveAttribute(
    'href',
    '?competence=2026-09',
  );
});

it('pastes tab-separated revenues into matching visible rows only', async () => {
  const update = vi.fn().mockResolvedValue({ status: 'success' as const, version: 2 });
  render(<AssessmentGrid rows={rows} competence="2026-08" onUpdate={update} />);

  fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'pending' } });
  const firstRevenue = screen.getByRole('textbox', { name: 'Receita de Empresa Visível Um' });
  fireEvent.paste(firstRevenue, {
    clipboardData: { getData: () => '1.234,56\t2.345,67' },
  });

  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(update.mock.calls.map(([input]) => input.revenue)).toEqual(['1.234,56', '2.345,67']);
  expect(screen.queryByRole('textbox', { name: 'Receita de Empresa Oculta' })).not.toBeInTheDocument();

  const grid = screen.getByRole('grid', { name: 'Apurações de 2026-08' });
  expect(within(grid).getByDisplayValue('1.234,56')).toBeVisible();
  expect(within(grid).getByDisplayValue('2.345,67')).toBeVisible();
});

import { render, screen } from '@testing-library/react';
import { ImportPreviewDetails } from './import-dialog';

it('shows invalid source rows with location, document, and exact reasons', () => {
  render(
    <ImportPreviewDetails
      previewToken="40000000-0000-4000-8000-000000000011"
      preview={{
        validRows: [
          {
            rowNumber: 2,
            sheet: 'Simples',
            obligation: 'simples',
            name: 'Empresa Fictícia Gama',
            document: '27182818000129',
            responsibleName: 'Escritório Fictício Alfa',
            responsibleDocument: '99988877000108',
            configuration: {},
            activity: 'commerce',
            taxOption: 'Comércio varejista',
            revenue: 10000,
            revenueCents: 1000000,
          },
        ],
        invalidRows: [
          {
            rowNumber: 2,
            sheet: 'INSS',
            obligation: 'inss',
            name: 'Pessoa Inválida',
            document: '12345678900',
            responsibleName: 'Escritório Fictício Alfa',
            responsibleDocument: '99988877000108',
            configuration: {},
            errors: ['CPF inválido'],
          },
        ],
        summary: { valid: 1, invalid: 1, taxpayers: 1 },
      }}
    />,
  );

  expect(screen.getByText(/1 linha válida e 1 linha inválida/)).toBeVisible();
  expect(screen.getByText('INSS')).toBeVisible();
  expect(screen.getByText('Linha 2')).toBeVisible();
  expect(screen.getByText('12345678900')).toBeVisible();
  expect(screen.getByText('CPF inválido')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Confirmar importação' })).toBeEnabled();
});

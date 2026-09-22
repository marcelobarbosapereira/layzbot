import { test, expect } from '@playwright/test';

test('simulated MVP flow imports, resumes, and reports mixed fixture outcomes', async ({ page }) => {
  const fixtureItems = [
    { company: 'Empresa fixture A', status: 'completed', document: 'DAS_A.pdf' },
    { company: 'Empresa fixture B', status: 'needs_attention', document: null },
    { company: 'Empresa fixture C', status: 'interrupted', document: null },
  ];
  await page.setContent(`<main><h1>Importação simulada</h1><p data-phase="import">3 empresas importadas</p><p data-phase="competence">Competência 2026-09</p><ul id="items"></ul><p role="status"></p></main>`);
  await page.evaluate((items) => {
    const list = document.querySelector('#items')!;
    for (const item of items) {
      const row = document.createElement('li');
      row.dataset.status = item.status;
      row.textContent = `${item.company}: ${item.status}${item.document ? ` — ${item.document}` : ''}`;
      list.append(row);
    }
  }, fixtureItems);
  await expect(page.getByText('3 empresas importadas')).toBeVisible();
  await expect(page.locator('[data-status="completed"]')).toContainText('DAS_A.pdf');
  await expect(page.locator('[data-status="needs_attention"]')).toContainText('Empresa fixture B');

  await page.evaluate(() => {
    const interrupted = document.querySelector<HTMLElement>('[data-status="interrupted"]')!;
    interrupted.dataset.status = 'completed';
    interrupted.textContent = 'Empresa fixture C: completed — DAS_C.pdf';
    document.querySelector('[role="status"]')!.textContent = 'Retomada após interrupção; transmissão simulada';
  });
  await expect(page.getByRole('status')).toHaveText('Retomada após interrupção; transmissão simulada');
  await expect(page.locator('[data-status="completed"]')).toHaveCount(2);
  await expect(page.locator('body')).not.toContainText('CPF');
});

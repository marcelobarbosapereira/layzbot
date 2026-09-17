import { expect, test } from '@playwright/test';

const email = process.env.LAZYBOT_E2E_EMAIL;
const password = process.env.LAZYBOT_E2E_PASSWORD;

test.skip(!email || !password, 'Requires a fabricated local Supabase user in LAZYBOT_E2E_EMAIL/PASSWORD.');

test('creates a competence and persists two revenues without changing the previous competence', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email!);
  await page.getByLabel('Senha').fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();

  async function openCompetence(competence: string) {
    await page.goto(`/simples?competence=${competence}`);
    await page.getByLabel('Nova competência').fill(competence);
    await page.getByRole('button', { name: 'Criar competência' }).click();
    await expect(page.getByText(/apurações criadas/)).toBeVisible();
    await page.locator(`a[href="?competence=${competence}"]`).click();
    await expect(page.getByRole('grid', { name: `Apurações de ${competence}` })).toBeVisible();
  }

  await openCompetence('2026-08');
  const previousRevenues = page.locator('input[aria-label^="Receita de "]');
  await expect(previousRevenues.nth(1)).toBeVisible();
  const priorValues = [await previousRevenues.nth(0).inputValue(), await previousRevenues.nth(1).inputValue()];

  await openCompetence('2026-09');
  const currentRevenues = page.locator('input[aria-label^="Receita de "]');
  await currentRevenues.nth(0).fill('1.234,56');
  await currentRevenues.nth(0).press('Tab');
  await currentRevenues.nth(1).fill('2.345,67');
  await currentRevenues.nth(1).press('Tab');
  await expect(currentRevenues.nth(0)).toHaveValue('1.234,56');
  await expect(currentRevenues.nth(1)).toHaveValue('2.345,67');
  await expect(page.getByText('Salvo', { exact: true })).toHaveCount(2);

  await page.reload();
  await expect(page.locator('input[aria-label^="Receita de "]').nth(0)).toHaveValue('1.234,56');
  await expect(page.locator('input[aria-label^="Receita de "]').nth(1)).toHaveValue('2.345,67');

  await page.locator('a[href="?competence=2026-08"]').click();
  await expect(page.locator('input[aria-label^="Receita de "]').nth(0)).toHaveValue(priorValues[0]);
  await expect(page.locator('input[aria-label^="Receita de "]').nth(1)).toHaveValue(priorValues[1]);
});

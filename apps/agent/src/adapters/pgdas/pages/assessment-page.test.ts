import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgdasAssessmentPage } from './assessment-page.js';

let browser: Browser;
beforeAll(async () => { try { browser = await chromium.launch({ headless: true }); } catch { /* browser install is optional */ } }, 30000);
afterAll(async () => { await browser?.close(); });

describe('PGDAS assessment page', () => {
  it('fills one activity and independently reads back competence, activity and revenue', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await browser.newPage();
    await page.setContent(`<main>
      <input data-competence-input value="09/2026" />
      <button data-activity-option type="button">Comércio</button>
      <input data-revenue-input aria-label="Receita" />
      <dl><dd data-summary-competence>09/2026</dd><dd data-summary-activity>Comércio</dd><dd data-summary-revenue-cents="123450">R$ 1.234,50</dd></dl>
      <button type="button">Calcular</button><output data-total-due-cents="9876">R$ 98,76</output>
    </main>`);
    await page.locator('[data-revenue-input]').evaluate((el) => el.addEventListener('input', () => {
      const summary = document.querySelector('[data-summary-revenue-cents]');
      if (summary) { summary.setAttribute('data-summary-revenue-cents', '123450'); summary.textContent = 'R$ 1.234,50'; }
    }));
    const result = await new PgdasAssessmentPage(page).fillAndCalculate({ competence: '09/2026', revenueCents: 123450, activity: 'commerce', taxpayerId: 'tax-1' });
    expect(result.status).toBe('filled');
    if (result.status === 'filled') expect(result.calculated?.totalDueCents).toBe(9876);
    await page.close();
  });

  it('returns attention for unsupported activity, decimal/negative boundary, and mismatched option', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await browser.newPage();
    await page.setContent(`<input data-competence-input value="09/2026" /><button data-activity-option>Serviços</button><input data-revenue-input />
      <span data-summary-competence>09/2026</span><span data-summary-activity>Serviços</span><span data-summary-revenue-cents="10">R$ 0,10</span>`);
    const object = new PgdasAssessmentPage(page);
    await expect(object.fill({ competence: '09/2026', revenueCents: 10, activity: 'commerce', taxpayerId: 't' })).resolves.toEqual({ status: 'needs_attention', reason: 'ACTIVITY_MISMATCH' });
    await expect(object.fill({ competence: '09/2026', revenueCents: -1, activity: 'services', taxpayerId: 't' })).resolves.toEqual({ status: 'needs_attention', reason: 'INVALID_ASSESSMENT' });
    await expect(object.fill({ competence: '09/2026', revenueCents: 10.5, activity: 'services', taxpayerId: 't' })).resolves.toEqual({ status: 'needs_attention', reason: 'INVALID_ASSESSMENT' });
    await page.close();
  });

  it('rejects missing or different competence before editing revenue', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await browser.newPage(); await page.setContent('<input data-competence-input value="08/2026" />');
    await expect(new PgdasAssessmentPage(page).fill({ competence: '09/2026', revenueCents: 1, activity: 'commerce', taxpayerId: 't' })).resolves.toEqual({ status: 'needs_attention', reason: 'COMPETENCE_MISMATCH' });
    await page.close();
  });
});

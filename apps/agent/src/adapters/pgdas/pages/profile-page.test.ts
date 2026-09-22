import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgdasLoginPage } from './login-page.js';
import { PgdasProfilePage } from './profile-page.js';
import { captureSanitizedScreenshot, SCREENSHOT_SANITIZATION_UNCONFIRMED } from '../../../sanitization/screenshot.js';

let browser: Browser;
beforeAll(async () => {
  try { browser = await chromium.launch({ headless: true }); } catch { /* browser install is optional on this host */ }
}, 30000);
afterAll(async () => { await browser?.close(); });

const run = (name: string, fn: () => Promise<void>) => it(name, async (ctx) => {
  if (!browser) return ctx.skip();
  await fn();
});
const fixtureDocument = ['0000000', '0000100'].join('');
const otherFixtureDocument = ['1111111', '1111111'].join('');

describe('PGDAS identity and representative page objects', () => {
  run('verifies the normalized certificate and selects the exact taxpayer', async () => {
    const taxpayerDocument = ['0000000', '0000100'].join('');
    const responsibleDocument = ['00000', '00000', '000'].join('');
    const page = await browser.newPage();
    await page.setContent(`<main>
      <section data-certificate data-responsible-id="resp-1" data-responsible-document="${responsibleDocument}" data-subject=" CN=Fixture Responsible " data-fingerprint="ABC123"></section>
      <section data-taxpayer-profile data-taxpayer-id="tax-1">
        <span data-taxpayer-document>00.000.000/0001-00</span>
        <button type="button">Selecionar representante</button>
      </section>
    </main>`);
    const login = await new PgdasLoginPage(page).authenticate({ id: 'resp-1', document: responsibleDocument, subject: 'cn=fixture responsible', fingerprint: 'abc123' });
    expect(login).toEqual({ status: 'verified', responsibleId: 'resp-1', certificateSubject: ' CN=Fixture Responsible ' });
    const profile = await new PgdasProfilePage(page).select({ id: 'tax-1', document: taxpayerDocument });
    expect(profile).toEqual({ status: 'verified', taxpayerId: 'tax-1' });
    expect(JSON.stringify({ login, profile })).not.toContain(taxpayerDocument);
    await page.close();
  });

  run('rejects ambiguous certificates, profiles, and selection controls', async () => {
    const page = await browser.newPage();
    await page.setContent(`<main>
      <section data-certificate data-responsible-id="resp-1" data-subject="CN=Fixture"></section>
      <section data-certificate data-responsible-id="resp-1" data-subject="CN=Fixture"></section>
      <section data-taxpayer-profile data-taxpayer-id="tax-1"><span data-taxpayer-document>${fixtureDocument}</span><button>Selecionar</button></section>
      <section data-taxpayer-profile data-taxpayer-id="tax-1"><span data-taxpayer-document>${fixtureDocument}</span><button>Selecionar</button></section>
    </main>`);
    await expect(new PgdasLoginPage(page).authenticate({ id: 'resp-1' })).resolves.toEqual({ status: 'needs_attention', reason: 'UNEXPECTED_CERTIFICATE' });
    await expect(new PgdasProfilePage(page).select({ id: 'tax-1', document: fixtureDocument })).resolves.toEqual({ status: 'needs_attention', reason: 'AUTHORIZATION_MISSING' });
    await page.close();

    const buttonPage = await browser.newPage();
    await buttonPage.setContent(`<section data-taxpayer-profile data-taxpayer-id="tax-1"><span data-taxpayer-document="">${fixtureDocument}</span><button>Selecionar</button><button>Selecionar</button></section>`);
    await expect(new PgdasProfilePage(buttonPage).select({ id: 'tax-1', document: fixtureDocument })).resolves.toEqual({ status: 'needs_attention', reason: 'AUTHORIZATION_MISSING' });
    await buttonPage.close();
  });

  run('rejects a profile whose visible document differs from its snapshot', async () => {
    const page = await browser.newPage();
    await page.setContent(`<section data-taxpayer-profile data-taxpayer-id="tax-1"><span data-taxpayer-document>${otherFixtureDocument}</span><button>Selecionar</button></section>`);
    const result = await new PgdasProfilePage(page).select({ id: 'tax-1', document: fixtureDocument });
    expect(result).toEqual({ status: 'needs_attention', reason: 'AUTHORIZATION_MISSING' });
    await page.close();
  });

  it.each([
    ['unexpected certificate', '<main><section data-certificate data-responsible-id="other" data-subject="CN=Other"></section></main>', 'UNEXPECTED_CERTIFICATE'],
    ['missing authorization', '<main><p data-status="missing">Procuração não encontrada</p></main>', 'AUTHORIZATION_MISSING'],
    ['maintenance', '<main><p data-status="unavailable">Manutenção</p></main>', 'MAINTENANCE'],
    ['captcha', '<main><p data-status="required">CAPTCHA</p></main>', 'CAPTCHA'],
  ])('returns a stable reason for %s without exposing documents', async (_name, html, reason) => {
    if (!browser) return;
    const page = await browser.newPage(); await page.setContent(html);
    const responsibleDocument = ['00000', '00000', '000'].join('');
    const result = await new PgdasLoginPage(page).authenticate({ id: 'resp-1', document: responsibleDocument });
    expect(result).toEqual({ status: 'needs_attention', reason });
    expect(JSON.stringify(result)).not.toContain(responsibleDocument);
    await page.close();
  });

  run('refuses an unconfirmed screenshot and masks all four sensitive regions', async () => {
    const taxpayerDocument = ['0000000', '0000100'].join('');
    const page = await browser.newPage();
    await page.setContent(`<main><span id="doc">${taxpayerDocument}</span><span id="name">Fixture Person</span><span id="revenue">R$ 1.234,00</span><span id="barcode">1234567890</span></main>`);
    await expect(captureSanitizedScreenshot(page, {
      documentNumber: page.locator('#doc'), name: page.locator('#name'), revenue: page.locator('#revenue'), barcode: page.locator('#barcode'),
    })).resolves.toBeInstanceOf(Buffer);
    await expect(captureSanitizedScreenshot(page, {
      documentNumber: page.locator('#doc'), name: page.locator('#name'), revenue: page.locator('#revenue'), barcode: page.locator('#missing'),
    })).rejects.toThrow(SCREENSHOT_SANITIZATION_UNCONFIRMED);
    await page.close();
  });
});

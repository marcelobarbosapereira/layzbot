import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgdasSubmissionPage, type RemoteDeclaration, type SubmissionEvent } from './submission-page.js';

let browser: Browser;
beforeAll(async () => { try { browser = await chromium.launch({ headless: true }); } catch { /* optional browser dependency */ } }, 30000);
afterAll(async () => { await browser?.close(); });

const input = { confirmationId: 'PG-001', summaryFingerprint: 'fp-1' };
const matching: RemoteDeclaration = { status: 'transmitted', ...input };

async function fixture(html = `<main><span data-summary-confirmation-id>PG-001</span><span data-summary-fingerprint>fp-1</span><button data-submit>Transmitir</button></main>`) {
  const page = await browser.newPage();
  await page.setContent(html);
  return page;
}

async function clicks(page: import('playwright').Page): Promise<number> {
  return Number(await page.locator('[data-submit]').getAttribute('data-clicks') ?? 0);
}

describe('PGDAS submission guard', () => {
  it('submits once when no declaration exists and persists submission_started first', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await fixture();
    let remote: RemoteDeclaration | null = null;
    const events: SubmissionEvent[] = [];
    await page.locator('[data-submit]').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicks', String(Number(button.getAttribute('data-clicks') ?? 0) + 1))));
    const result = await new PgdasSubmissionPage(page, {
      readRemote: async () => remote,
      persistEvent: async (event) => { events.push(event); },
      afterClick: async () => { remote = matching; },
    }).submit({ ...input, localState: 'calculated' });
    expect(result.status).toBe('submitted');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('submission_started');
    expect(events[0]?.attemptId).toMatch(/^pgdas-PG-001-/);
    expect(await page.locator('[data-submit]').count()).toBe(1);
    await page.close();
  });

  it('advances a matching transmitted declaration without clicking', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await fixture();
    await page.locator('[data-submit]').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicks', String(Number(button.getAttribute('data-clicks') ?? 0) + 1))));
    const result = await new PgdasSubmissionPage(page, { readRemote: async () => matching, persistEvent: async () => {}}).submit({ ...input, localState: 'calculated' });
    expect(result.status).toBe('alreadySubmitted');
    expect(await clicks(page)).toBe(0);
    await page.close();
  });

  it('blocks conflicting and unknown declarations without clicking', async (ctx) => {
    if (!browser) return ctx.skip();
    for (const remote of [{ status: 'conflict', confirmationId: 'PG-002', summaryFingerprint: 'fp-2' } as RemoteDeclaration, { status: 'unknown' } as RemoteDeclaration]) {
      const page = await fixture();
      await page.locator('[data-submit]').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicks', String(Number(button.getAttribute('data-clicks') ?? 0) + 1))));
      const result = await new PgdasSubmissionPage(page, { readRemote: async () => remote, persistEvent: async () => {}}).submit({ ...input, localState: 'calculated' });
      expect(result.status).toBe('needsAttention'); expect(await clicks(page)).toBe(0);
      await page.close();
    }
  });

  it('reconciles remote transmission when local state is still calculated', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await fixture();
    await page.locator('[data-submit]').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicks', String(Number(button.getAttribute('data-clicks') ?? 0) + 1))));
    const result = await new PgdasSubmissionPage(page, { readRemote: async () => matching, persistEvent: async () => {}}).submit({ ...input, localState: 'calculated' });
    expect(result.status).toBe('alreadySubmitted'); expect(await clicks(page)).toBe(0);
    await page.close();
  });

  it('re-reads the exact summary and refuses a mismatch before clicking', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await fixture(`<span data-summary-confirmation-id>PG-001</span><span data-summary-fingerprint>changed</span><button data-submit>Transmitir</button>`);
    await page.locator('[data-submit]').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicks', String(Number(button.getAttribute('data-clicks') ?? 0) + 1))));
    const result = await new PgdasSubmissionPage(page, { readRemote: async () => null, persistEvent: async () => {}}).submit({ ...input, localState: 'calculated' });
    expect(result.status).toBe('needsAttention'); expect(await clicks(page)).toBe(0);
    await page.close();
  });

  it('queries remote after connection loss and never clicks again from submission_started', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await fixture(); let reads = 0; const events: SubmissionEvent[] = [];
    await page.locator('[data-submit]').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicks', String(Number(button.getAttribute('data-clicks') ?? 0) + 1))));
    const guard = new PgdasSubmissionPage(page, {
      readRemote: async () => { reads += 1; return null; }, persistEvent: async (event) => { events.push(event); },
      afterClick: async () => { throw new Error('CONNECTION_LOST'); },
    });
    const first = await guard.submit({ ...input, localState: 'calculated' });
    expect(first.status).toBe('needsAttention'); expect(await clicks(page)).toBe(1); expect(reads).toBe(2);
    const second = await guard.submit({ ...input, localState: 'submission_started' });
    expect(second.status).toBe('needsAttention'); expect(await clicks(page)).toBe(1); expect(events).toHaveLength(1);
    await page.close();
  });

  it('requires confirmation and fingerprint before any remote interaction', async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await fixture(); let reads = 0;
    await page.locator('[data-submit]').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicks', String(Number(button.getAttribute('data-clicks') ?? 0) + 1))));
    const result = await new PgdasSubmissionPage(page, { readRemote: async () => { reads += 1; return null; }, persistEvent: async () => {}}).submit({ confirmationId: '', summaryFingerprint: '', localState: 'calculated' });
    expect(result.status).toBe('needsAttention'); expect(reads).toBe(0); expect(await clicks(page)).toBe(0);
    await page.close();
  });
});

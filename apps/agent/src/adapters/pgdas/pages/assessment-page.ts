import type { Page } from 'playwright';
import { activityOptionMatches, mapActivity, type ActivityCode } from '../mappings/activity.js';

export type AssessmentSnapshot = {
  competence: string;
  revenueCents: number;
  activity: ActivityCode | string;
  taxpayerId: string;
  taxpayerDocument?: string;
  taxpayerName?: string;
};

export type AssessmentAttentionReason =
  | 'ACTIVITY_MISMATCH'
  | 'COMPETENCE_MISMATCH'
  | 'REVENUE_MISMATCH'
  | 'INVALID_ASSESSMENT';

export type AssessmentResult =
  | { status: 'filled'; snapshot: AssessmentSnapshot }
  | { status: 'needs_attention'; reason: AssessmentAttentionReason };

export type CalculatedAssessment = {
  totalDueCents: number;
  summaryFingerprint: string;
};

/** Page object for the editable assessment boundary. It never submits a declaration. */
export class PgdasAssessmentPage {
  constructor(private readonly page: Page) {}

  async fill(snapshot: AssessmentSnapshot): Promise<AssessmentResult> {
    if (!Number.isSafeInteger(snapshot.revenueCents) || snapshot.revenueCents < 0) {
      return { status: 'needs_attention', reason: 'INVALID_ASSESSMENT' };
    }
    const mapping = mapActivity(snapshot.activity);
    if (mapping.status !== 'matched') return mapping;
    const competenceOptions = this.page.locator('[data-competence-option]');
    if (await competenceOptions.count()) {
      let matched = 0;
      for (let index = 0; index < await competenceOptions.count(); index += 1) {
        const candidate = competenceOptions.nth(index);
        if ((await candidate.innerText()).trim() === snapshot.competence && await candidate.isVisible() && await candidate.isEnabled()) {
          matched += 1;
          await candidate.click();
        }
      }
      if (matched !== 1) return { status: 'needs_attention', reason: 'COMPETENCE_MISMATCH' };
    } else {
      const competence = this.page.locator('[data-competence-input], [data-competence]');
      if (await competence.count() !== 1) return { status: 'needs_attention', reason: 'COMPETENCE_MISMATCH' };
      const competenceValue = await this.readValue(competence);
      if (competenceValue && competenceValue !== snapshot.competence) {
        return { status: 'needs_attention', reason: 'COMPETENCE_MISMATCH' };
      }
    }
    const options = this.page.locator('[data-activity-option]');
    const matchingOptions = [] as ReturnType<Page['locator']>[];
    for (let index = 0; index < await options.count(); index += 1) {
      const candidate = options.nth(index);
      if (activityOptionMatches(mapping.mapping, await candidate.innerText())) matchingOptions.push(candidate);
    }
    if (matchingOptions.length !== 1 || !await matchingOptions[0].isVisible()) {
      return { status: 'needs_attention', reason: 'ACTIVITY_MISMATCH' };
    }
    await matchingOptions[0].click();
    const revenue = this.page.locator('[data-revenue-input], input[ name="revenue"], input[aria-label*="receita" i]');
    if (await revenue.count() !== 1) return { status: 'needs_attention', reason: 'REVENUE_MISMATCH' };
    await revenue.fill(formatCents(snapshot.revenueCents));
    const selected = await this.readSummary();
    if (!selected || selected.competence !== snapshot.competence) {
      return { status: 'needs_attention', reason: 'COMPETENCE_MISMATCH' };
    }
    if (!activityOptionMatches(mapping.mapping, selected.activity)) {
      return { status: 'needs_attention', reason: 'ACTIVITY_MISMATCH' };
    }
    if (selected.revenueCents !== snapshot.revenueCents) {
      return { status: 'needs_attention', reason: 'REVENUE_MISMATCH' };
    }
    return { status: 'filled', snapshot };
  }

  async fillAndCalculate(snapshot: AssessmentSnapshot): Promise<AssessmentResult & { calculated?: CalculatedAssessment }> {
    const filled = await this.fill(snapshot);
    if (filled.status !== 'filled') return filled;
    const button = this.page.getByRole('button', { name: /calcular/i });
    if (await button.count() !== 1) return { status: 'needs_attention', reason: 'INVALID_ASSESSMENT' };
    await button.click();
    const calculated = await this.calculated(snapshot);
    return calculated ? { ...filled, calculated } : { status: 'needs_attention', reason: 'INVALID_ASSESSMENT' };
  }

  async calculated(snapshot: AssessmentSnapshot): Promise<CalculatedAssessment | null> {
    const summary = await this.readSummary();
    const total = this.page.locator('[data-total-due-cents], [data-total-due], [data-testid="total-due"]');
    if (!summary || await total.count() !== 1) return null;
    const mapping = mapActivity(snapshot.activity);
    if (summary.competence !== snapshot.competence || mapping.status !== 'matched' ||
        !activityOptionMatches(mapping.mapping, summary.activity) || summary.revenueCents !== snapshot.revenueCents) return null;
    const totalText = await this.readValue(total);
    const totalDueCents = total.getAttribute ? Number(await total.getAttribute('data-total-due-cents')) : Number.NaN;
    const parsed = Number.isSafeInteger(totalDueCents) ? totalDueCents : parseCents(totalText);
    if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
    const fingerprint = [snapshot.competence, snapshot.taxpayerId, snapshot.taxpayerDocument ?? '', snapshot.taxpayerName ?? '', snapshot.activity,
      snapshot.revenueCents, parsed].join('|');
    return { totalDueCents: parsed, summaryFingerprint: await sha256(fingerprint) };
  }

  /** Alias kept explicit for callers that separate fill and calculation. */
  async calculate(snapshot: AssessmentSnapshot): Promise<CalculatedAssessment | null> {
    return this.calculated(snapshot);
  }

  private async readSummary(): Promise<{ competence: string; activity: string; revenueCents: number } | null> {
    const competence = this.page.locator('[data-summary-competence]');
    const activity = this.page.locator('[data-summary-activity]');
    const revenue = this.page.locator('[data-summary-revenue-cents], [data-summary-revenue]');
    if (await competence.count() !== 1 || await activity.count() !== 1 || await revenue.count() !== 1) return null;
    const revenueCents = Number(await revenue.getAttribute('data-summary-revenue-cents'));
    return { competence: (await competence.innerText()).trim(), activity: (await activity.innerText()).trim(), revenueCents: Number.isSafeInteger(revenueCents) ? revenueCents : parseCents(await revenue.innerText()) };
  }

  private async readValue(locator: ReturnType<Page['locator']>): Promise<string> {
    return ((await locator.getAttribute('value')) ?? await locator.innerText()).trim();
  }
}

function formatCents(cents: number): string { return (cents / 100).toFixed(2).replace('.', ','); }
function parseCents(value: string): number { const clean = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'); const n = Number(clean); return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN; }
async function sha256(value: string): Promise<string> { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

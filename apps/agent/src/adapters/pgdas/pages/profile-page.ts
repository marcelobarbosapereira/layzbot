import type { Page } from 'playwright';
import type { PgdasAttentionReason } from './login-page.js';

export type TaxpayerSnapshot = { id: string; document: string; name?: string };
export type ProfileResult =
  | { status: 'verified'; taxpayerId: string }
  | { status: 'needs_attention'; reason: PgdasAttentionReason };

/** Representative selection page object. It only selects a matching profile. */
export class PgdasProfilePage {
  constructor(private readonly page: Page) {}

  async select(snapshot: TaxpayerSnapshot): Promise<ProfileResult> {
    const reason = await this.attentionReason();
    if (reason) return { status: 'needs_attention', reason };
    const profile = this.page.locator(`[data-taxpayer-profile][data-taxpayer-id="${escapeAttribute(snapshot.id)}"]`);
    if (await profile.count() !== 1) return { status: 'needs_attention', reason: 'AUTHORIZATION_MISSING' };
    const documentLocator = profile.locator('[data-taxpayer-document], [data-document], [aria-label*="document" i], [aria-label*="CNPJ" i], [aria-label*="CPF" i]');
    if (await documentLocator.count() !== 1) return { status: 'needs_attention', reason: 'AUTHORIZATION_MISSING' };
    if (!(await documentLocator.isVisible())) return { status: 'needs_attention', reason: 'AUTHORIZATION_MISSING' };
    const displayed = await documentLocator.innerText();
    if (normalizeDocument(displayed) !== normalizeDocument(snapshot.document)) {
      return { status: 'needs_attention', reason: 'AUTHORIZATION_MISSING' };
    }
    const select = profile.getByRole('button', { name: /selecionar|acessar|representar/i });
    if (await select.count() !== 1) return { status: 'needs_attention', reason: 'AUTHORIZATION_MISSING' };
    await select.click();
    return { status: 'verified', taxpayerId: snapshot.id };
  }

  private async attentionReason(): Promise<PgdasAttentionReason | undefined> {
    if (await this.page.locator('[data-status="required"]').count()) return 'CAPTCHA';
    if (await this.page.locator('[data-status="unavailable"]').count()) return 'MAINTENANCE';
    return undefined;
  }
}

function normalizeDocument(value: string): string { return value.replace(/\D/g, ''); }
function escapeAttribute(value: string): string { return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

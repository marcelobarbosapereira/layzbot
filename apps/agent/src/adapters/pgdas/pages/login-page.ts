import type { Page } from 'playwright';

export type PgdasAttentionReason =
  | 'UNEXPECTED_CERTIFICATE'
  | 'AUTHORIZATION_MISSING'
  | 'MAINTENANCE'
  | 'CAPTCHA';

export type ResponsibleExpectation = {
  id: string;
  name?: string;
  document?: string;
  subject?: string;
  fingerprint?: string;
};

export type LoginResult =
  | { status: 'verified'; responsibleId: string; certificateSubject: string }
  | { status: 'needs_attention'; reason: PgdasAttentionReason };

/** Semantic, read-only login boundary. It never submits credentials or forms. */
export class PgdasLoginPage {
  constructor(private readonly page: Page) {}

  async authenticate(expected: ResponsibleExpectation): Promise<LoginResult> {
    const reason = await this.attentionReason();
    if (reason) return { status: 'needs_attention', reason };

    const certificate = this.page.locator('[data-certificate]').first();
    if (await certificate.count() !== 1) return { status: 'needs_attention', reason: 'UNEXPECTED_CERTIFICATE' };
    const responsibleId = await certificate.getAttribute('data-responsible-id');
    const subject = await certificate.getAttribute('data-subject');
    const fingerprint = await certificate.getAttribute('data-fingerprint');
    const matches = responsibleId === expected.id
      && (!expected.subject || normalize(subject) === normalize(expected.subject))
      && (!expected.fingerprint || normalize(fingerprint) === normalize(expected.fingerprint));
    if (!matches || !subject) return { status: 'needs_attention', reason: 'UNEXPECTED_CERTIFICATE' };
    return { status: 'verified', responsibleId: expected.id, certificateSubject: subject };
  }

  private async attentionReason(): Promise<PgdasAttentionReason | undefined> {
    if (await this.page.locator('[data-status="required"]').count()) return 'CAPTCHA';
    if (await this.page.locator('[data-status="missing"]').count()) return 'AUTHORIZATION_MISSING';
    if (await this.page.locator('[data-status="unavailable"]').count()) return 'MAINTENANCE';
    return undefined;
  }
}

function normalize(value: string | null | undefined): string { return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }

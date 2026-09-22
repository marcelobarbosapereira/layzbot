import type { AgentJob, JobReporter, PortalAdapter } from '../portal-adapter.js';
import { assertTransmissionAllowed, transition, type PgdasState } from './state.js';

export type PgdasReporter = JobReporter & {
  /** Optional richer reporter used by the fixture adapter and future runtime. */
  checkpoint?: (state: PgdasState, message: string) => Promise<void>;
};

export type PgdasAdapterOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
  /** Kept false intentionally: Task 14 has no fiscal side effects. */
  allowTransmission?: false;
};

const pages = [
  ['certificate-accepted', 'authenticating', 'profile_selected', 'Certificado aceito'],
  ['representative-selection', 'profile_selected', null, 'Representante confirmado'],
  ['competence-selection', 'profile_selected', 'assessment_filled', 'Competência selecionada'],
  ['existing-declaration', 'assessment_filled', null, 'Estado remoto consultado'],
  ['revenue-entry', 'assessment_filled', null, 'Receita lida de volta'],
  ['calculation', 'assessment_filled', 'calculated', 'Cálculo conferido'],
] as const;

/**
 * Fixture-only PGDAS coordinator. It stops at the confirmation boundary and
 * never sends a POST or clicks a transmission control.
 */
export class PgdasAdapter implements PortalAdapter {
  private state: PgdasState = 'authenticating';
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: PgdasAdapterOptions) {
    this.fetcher = options.fetcher ?? fetch;
    if (!options.baseUrl.startsWith('http://') && !options.baseUrl.startsWith('https://')) {
      throw new Error('PGDAS_BASE_URL_INVALID');
    }
    if (options.allowTransmission) throw new Error('PGDAS_TRANSMISSION_DISABLED');
  }

  get lastState(): PgdasState { return this.state; }

  async execute(job: AgentJob, reporter: JobReporter, signal: AbortSignal): Promise<void> {
    const pgdasReporter = reporter as PgdasReporter;
    if (typeof pgdasReporter.checkpoint !== 'function') {
      throw new Error('PGDAS_CHECKPOINT_REQUIRED');
    }
    const parameters = job.parameters;
    assertTransmissionAllowed({
      confirmed: parameters.confirmed === true,
      fingerprint: typeof parameters.snapshotFingerprint === 'string' ? parameters.snapshotFingerprint : '',
    });
    for (const [page, from, to, message] of pages) {
      this.throwIfAborted(signal);
      await pgdasReporter.checkpoint?.(this.state, `Reading fixture ${page}`);
      const html = await this.readFixture(page, signal);
      this.assertHealthyFixture(page, html);
      if (to) this.move(from, to);
      await pgdasReporter.checkpoint?.(this.state, message);
    }
    this.throwIfAborted(signal);
    await pgdasReporter.checkpoint?.(this.state, 'Reading fixture confirmation');
    const confirmation = await this.readFixture('confirmation', signal);
    this.assertHealthyFixture('confirmation', confirmation);
    await pgdasReporter.checkpoint?.('calculated', 'Aguardando revisão antes da transmissão');
    // Deliberately no submitted event, receipt download, DAS download, or POST.
  }

  private async readFixture(page: string, signal: AbortSignal): Promise<string> {
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/${page}.html`, {
      method: 'GET', signal,
    });
    if (!response.ok) throw new Error(`PGDAS_FIXTURE_UNAVAILABLE: ${page}`);
    return response.text();
  }

  private assertHealthyFixture(page: string, html: string): void {
    if (html.includes('data-status="required"')) throw new Error('PGDAS_CAPTCHA');
    if (html.includes('data-status="missing"')) throw new Error('PGDAS_AUTHORIZATION_MISSING');
    if (html.includes('data-status="unavailable"')) throw new Error('PGDAS_MAINTENANCE');
    if (!html.includes(`data-fixture="${page}"`)) throw new Error('PGDAS_FIXTURE_INVALID');
  }

  private move(from: PgdasState, to: PgdasState): void {
    if (this.state !== from) throw new Error(`INVALID_TRANSITION: ${this.state} -> ${to}`);
    this.state = transition(from, to);
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new Error('PGDAS_INTERRUPTED');
  }
}

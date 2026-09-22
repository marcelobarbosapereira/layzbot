import type { Page } from 'playwright';
import { createAttemptId, reconcileDeclaration, type DeclarationIdentity, type RemoteDeclaration } from '../idempotency.js';

export type SubmissionLocalState = 'calculated' | 'submission_started' | 'submitted' | 'alreadySubmitted';

export type SubmissionEvent = {
  type: 'submission_started';
  attemptId: string;
  confirmationId: string;
  summaryFingerprint: string;
};

export type SubmissionResult =
  | { status: 'submitted'; attemptId: string }
  | { status: 'alreadySubmitted'; confirmationId: string }
  | { status: 'needsAttention'; reason: SubmissionAttentionReason };

export type SubmissionAttentionReason =
  | 'CONFIRMATION_REQUIRED'
  | 'SNAPSHOT_FINGERPRINT_MISMATCH'
  | 'REMOTE_STATE_UNKNOWN'
  | 'CONFLICTING_DECLARATION'
  | 'AMBIGUOUS_SUBMISSION'
  | 'SUMMARY_MISMATCH'
  | 'SUBMIT_CONTROL_UNAVAILABLE';

export type SubmissionPageDependencies = {
  readRemote: () => Promise<RemoteDeclaration | null>;
  persistEvent: (event: SubmissionEvent) => Promise<void>;
  /** Fixture hook representing the server-side effect after the click. */
  afterClick?: () => Promise<void>;
};

/** Fixture-only page object. It has one click boundary and always reconciles remote state first. */
export class PgdasSubmissionPage {
  constructor(private readonly page: Page, private readonly dependencies: SubmissionPageDependencies) {}

  async submit(input: DeclarationIdentity & { localState: SubmissionLocalState }): Promise<SubmissionResult> {
    if (!input.confirmationId.trim()) return { status: 'needsAttention', reason: 'CONFIRMATION_REQUIRED' };
    if (!input.summaryFingerprint.trim()) return { status: 'needsAttention', reason: 'SNAPSHOT_FINGERPRINT_MISMATCH' };

    const remoteBefore = await this.readRemoteSafely();
    const reconciliation = reconcileDeclaration(remoteBefore, input);
    if (reconciliation === 'matching') return { status: 'alreadySubmitted', confirmationId: input.confirmationId };
    if (reconciliation === 'conflict') return { status: 'needsAttention', reason: 'CONFLICTING_DECLARATION' };
    if (reconciliation === 'unknown') return { status: 'needsAttention', reason: 'REMOTE_STATE_UNKNOWN' };
    // A prior click may have succeeded even when the client did not receive its response.
    if (input.localState === 'submission_started' || input.localState === 'submitted' || input.localState === 'alreadySubmitted') {
      return { status: 'needsAttention', reason: 'AMBIGUOUS_SUBMISSION' };
    }

    const summary = await this.readSummary();
    if (!summary || summary.confirmationId !== input.confirmationId || summary.summaryFingerprint !== input.summaryFingerprint) {
      return { status: 'needsAttention', reason: 'SUMMARY_MISMATCH' };
    }
    const submit = this.page.locator('[data-submit]');
    if (await submit.count() !== 1 || !await submit.isVisible() || !await submit.isEnabled()) {
      return { status: 'needsAttention', reason: 'SUBMIT_CONTROL_UNAVAILABLE' };
    }

    const attemptId = createAttemptId(input.confirmationId);
    await this.dependencies.persistEvent({ type: 'submission_started', attemptId, confirmationId: input.confirmationId, summaryFingerprint: input.summaryFingerprint });
    try {
      await submit.click();
      await this.dependencies.afterClick?.();
    } catch {
      return this.resolveAfterAmbiguousClick(input, attemptId);
    }
    const remoteAfter = await this.readRemoteSafely();
    if (reconcileDeclaration(remoteAfter, input) === 'matching') return { status: 'submitted', attemptId };
    return { status: 'needsAttention', reason: remoteAfter === null ? 'AMBIGUOUS_SUBMISSION' : 'REMOTE_STATE_UNKNOWN' };
  }

  private async resolveAfterAmbiguousClick(input: DeclarationIdentity, attemptId: string): Promise<SubmissionResult> {
    const remote = await this.readRemoteSafely();
    if (reconcileDeclaration(remote, input) === 'matching') return { status: 'submitted', attemptId };
    return { status: 'needsAttention', reason: remote === null ? 'AMBIGUOUS_SUBMISSION' : 'REMOTE_STATE_UNKNOWN' };
  }

  private async readRemoteSafely(): Promise<RemoteDeclaration | null> {
    try { return await this.dependencies.readRemote(); } catch { return { status: 'unknown' }; }
  }

  private async readSummary(): Promise<{ confirmationId: string; summaryFingerprint: string } | null> {
    const id = this.page.locator('[data-summary-confirmation-id]');
    const fingerprint = this.page.locator('[data-summary-fingerprint]');
    if (await id.count() !== 1 || await fingerprint.count() !== 1) return null;
    if (!await id.isVisible() || !await fingerprint.isVisible()) return null;
    return { confirmationId: (await id.innerText()).trim(), summaryFingerprint: (await fingerprint.innerText()).trim() };
  }
}

export type { RemoteDeclaration } from '../idempotency.js';

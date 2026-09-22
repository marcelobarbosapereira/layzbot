/** States used by the PGDAS adapter. Transitions are deliberately allow-listed. */
export const pgdasStates = [
  'pending', 'authenticating', 'profile_selected', 'assessment_filled', 'calculated',
  'transmitting', 'awaiting_result', 'submitted', 'das_downloaded', 'completed',
  'needs_attention', 'failed', 'interrupted',
] as const;

export type PgdasState = (typeof pgdasStates)[number];

const transitions: Record<PgdasState, readonly PgdasState[]> = {
  pending: ['authenticating', 'interrupted', 'failed'],
  authenticating: ['profile_selected', 'needs_attention', 'failed', 'interrupted'],
  profile_selected: ['assessment_filled', 'needs_attention', 'failed', 'interrupted'],
  assessment_filled: ['calculated', 'needs_attention', 'failed', 'interrupted'],
  calculated: ['transmitting', 'submitted', 'needs_attention', 'failed', 'interrupted'],
  transmitting: ['awaiting_result', 'submitted', 'needs_attention', 'failed', 'interrupted'],
  awaiting_result: ['submitted', 'needs_attention', 'failed', 'interrupted'],
  submitted: ['das_downloaded', 'completed', 'needs_attention', 'failed', 'interrupted'],
  das_downloaded: ['completed', 'needs_attention', 'failed', 'interrupted'],
  completed: [],
  needs_attention: [],
  failed: [],
  interrupted: [],
};

export function transition(from: PgdasState, to: PgdasState): PgdasState {
  if (!pgdasStates.includes(from) || !pgdasStates.includes(to) || !transitions[from].includes(to)) {
    throw new Error(`INVALID_TRANSITION: ${from} -> ${to}`);
  }
  return to;
}

export function isTerminal(state: PgdasState): boolean {
  return state === 'completed' || state === 'needs_attention' || state === 'failed' || state === 'interrupted';
}

export function isRetryable(state: PgdasState): boolean {
  return state === 'interrupted' || state === 'failed';
}

export type ConfirmedSnapshot = { confirmed: boolean; fingerprint: string };

export function assertTransmissionAllowed(snapshot: ConfirmedSnapshot): void {
  if (!snapshot.confirmed) throw new Error('CONFIRMATION_REQUIRED');
  if (!snapshot.fingerprint.trim()) throw new Error('SNAPSHOT_FINGERPRINT_REQUIRED');
}

export function permittedTransitions(state: PgdasState): readonly PgdasState[] {
  return transitions[state];
}

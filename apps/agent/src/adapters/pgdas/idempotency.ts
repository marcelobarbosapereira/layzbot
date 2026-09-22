export type DeclarationIdentity = {
  confirmationId: string;
  summaryFingerprint: string;
};

export type RemoteDeclaration =
  | ({ status: 'transmitted' | 'conflict' } & Partial<DeclarationIdentity>)
  | { status: 'unknown' };

export type DeclarationReconciliation = 'none' | 'matching' | 'conflict' | 'unknown';

/** Compares the immutable receipt identity and calculated snapshot, never just a status flag. */
export function reconcileDeclaration(
  remote: RemoteDeclaration | null,
  expected: DeclarationIdentity,
): DeclarationReconciliation {
  if (remote === null) return 'none';
  if (remote.status === 'unknown') return 'unknown';
  if (remote.status === 'transmitted' && remote.confirmationId === expected.confirmationId && remote.summaryFingerprint === expected.summaryFingerprint) {
    return 'matching';
  }
  return 'conflict';
}

/** Attempt IDs are operational identifiers; sensitive snapshot values are deliberately excluded. */
export function createAttemptId(confirmationId: string): string {
  const safeId = confirmationId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `pgdas-${safeId}-${crypto.randomUUID()}`;
}

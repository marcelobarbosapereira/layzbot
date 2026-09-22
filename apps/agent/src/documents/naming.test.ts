import { describe, expect, it } from 'vitest';
import { buildArtifactFileName, buildArtifactPath, resolveArtifactPath } from './naming.js';

const input = { ownerId: '10000000-0000-4000-8000-000000000001', responsible: 'Escritório Ágil/01', year: 2026, competence: '09-2026', company: 'Acme: Comércio *', document: '12345678000199', kind: 'das' as const };
describe('artifact naming', () => {
  it('normalizes invalid separators and keeps deterministic hierarchy', () => {
    const path = buildArtifactPath(input);
    expect(path).toBe('10000000-0000-4000-8000-000000000001/Escritorio Agil-01/simples-nacional/2026/09-2026/Acme- Comercio -/2026-09_DAS_Acme- Comercio -_12345678000199.pdf');
  });
  it('supports masked document names and caps long segments', () => {
    const name = buildArtifactFileName({ ...input, maskDocument: true, company: 'á'.repeat(200) });
    expect(name).toContain('2026-09_DAS_');
    expect(name).toContain('masked-0199.pdf');
    expect(name.length).toBeLessThan(220);
  });
  it('makes same hash a no-op and conflicting content a version', () => {
    const bytes = new TextEncoder().encode('fixture');
    expect(resolveArtifactPath(input, bytes, [])).toMatchObject({ action: 'create' });
    const first = resolveArtifactPath(input, bytes, [{ path: buildArtifactPath(input), sha256: resolveArtifactPath(input, bytes, []).hash }]);
    expect(first.action).toBe('noop');
    const different = resolveArtifactPath(input, new TextEncoder().encode('other'), [{ path: buildArtifactPath(input), sha256: first.hash }]);
    expect(different.action).toBe('version');
    expect(different.alert).toBe('ARTIFACT_CONTENT_CONFLICT');
  });
});

import { createHash } from 'node:crypto';

export type ArtifactKind = 'das' | 'receipt';
export type ArtifactNamingInput = {
  ownerId: string;
  responsible: string;
  year: number;
  competence: string;
  company: string;
  document: string;
  kind: ArtifactKind;
  maskDocument?: boolean;
};

const MAX_SEGMENT = 80;
const INVALID = /[<>:"/\\|?*\u0000-\u001f]/g;

export function normalizeSegment(value: string, fallback = 'document'): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(INVALID, '-').replace(/[. ]+$/g, '').replace(/\s+/g, ' ').trim();
  return (normalized.slice(0, MAX_SEGMENT) || fallback).replace(/^\.+$/, fallback);
}

function maskedDocument(value: string): string {
  const clean = value.replace(/\D/g, '');
  if (clean.length <= 4) return clean || 'documento';
  return `masked-${clean.slice(-4)}`;
}

export function buildArtifactFileName(input: ArtifactNamingInput): string {
  const company = normalizeSegment(input.company);
  const document = normalizeSegment(input.maskDocument ? maskedDocument(input.document) : input.document);
  const kind = input.kind === 'receipt' ? 'Recibo-PGDAS' : 'DAS';
  const month = /^([0-9]{2})-([0-9]{4})$/.exec(input.competence)?.[1] ?? normalizeSegment(input.competence);
  return `${input.year}-${month}_${kind}_${company}_${document}.pdf`;
}

export function buildArtifactPath(input: ArtifactNamingInput): string {
  const year = String(input.year);
  const competence = normalizeSegment(input.competence);
  const responsible = normalizeSegment(input.responsible);
  const company = normalizeSegment(input.company);
  return `${input.ownerId}/${responsible}/simples-nacional/${year}/${competence}/${company}/${buildArtifactFileName(input)}`;
}

export function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

export type PathResolution = { path: string; hash: string; action: 'create' | 'noop' | 'version'; alert?: string };
export function resolveArtifactPath(input: ArtifactNamingInput, content: Uint8Array, existing: ReadonlyArray<{ path: string; sha256: string }>): PathResolution {
  const path = buildArtifactPath(input);
  const hash = sha256(content);
  const same = existing.find((item) => item.path === path);
  if (!same) return { path, hash, action: 'create' };
  if (same.sha256 === hash) return { path, hash, action: 'noop' };
  const dot = path.lastIndexOf('.');
  return { path: `${path.slice(0, dot)}-v${existing.filter((item) => item.path.startsWith(path.slice(0, dot))).length + 1}${path.slice(dot)}`, hash, action: 'version', alert: 'ARTIFACT_CONTENT_CONFLICT' };
}

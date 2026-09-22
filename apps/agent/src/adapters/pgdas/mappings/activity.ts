export const activityMappings = {
  commerce: { code: 'commerce', portalOption: 'Comércio' },
  services: { code: 'services', portalOption: 'Serviços' },
} as const;

export type ActivityCode = keyof typeof activityMappings;
export type ActivityMapping = (typeof activityMappings)[ActivityCode];

export const ACTIVITY_MISMATCH = 'ACTIVITY_MISMATCH' as const;
export type ActivityMappingResult =
  | { status: 'matched'; mapping: ActivityMapping }
  | { status: 'needs_attention'; reason: typeof ACTIVITY_MISMATCH };

/** Maps an immutable internal profile to the exact visible portal option. */
export function mapActivity(code: string): ActivityMappingResult {
  if (code !== 'commerce' && code !== 'services') {
    return { status: 'needs_attention', reason: ACTIVITY_MISMATCH };
  }
  return { status: 'matched', mapping: activityMappings[code] };
}

export function normalizeActivityOption(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function activityOptionMatches(expected: ActivityMapping, visible: string): boolean {
  return normalizeActivityOption(expected.portalOption) === normalizeActivityOption(visible);
}

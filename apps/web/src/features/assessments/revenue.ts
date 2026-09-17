export function parseBrazilianCents(raw: string): number | null {
  const normalized = raw.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (!/^(?:0|[1-9][0-9]{0,2}(?:\.[0-9]{3})*|[1-9][0-9]*)(?:,[0-9]{1,2})?$/.test(normalized)) {
    return null;
  }

  const [integerPart, decimalPart = ''] = normalized.split(',');
  const whole = Number(integerPart.replaceAll('.', ''));
  const cents = Number(decimalPart.padEnd(2, '0'));
  const result = whole * 100 + cents;
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

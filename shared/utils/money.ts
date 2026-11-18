/**
 * Exact DZD Monetary Utilities (Integer Centimes — Zero Float Drift)
 * All financial calculations use integer centimes (1 DZD = 100 centimes).
 */

export const CURRENCY_CODE = 'DZD';

export function dzdToCentimes(amount: number | string | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) throw new Error('Invalid DZD monetary amount');
    return Math.round(amount * 100);
  }
  const normalized = amount.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid DZD amount string: "${amount}"`);
  }
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, fracPart = ''] = unsigned.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);
  const thirdDigit = fracPart.length > 2 ? parseInt(fracPart[2], 10) : 0;
  let centimes = parseInt(wholePart, 10) * 100 + parseInt(paddedFrac, 10);
  if (thirdDigit >= 5) centimes += 1;
  return negative ? -centimes : centimes;
}

export function centimesToDzd(centimes: number): number {
  return Math.round(centimes) / 100;
}

export function sumCentimes(values: number[]): number {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}

export function formatDzd(
  amount: number,
  options: { isCentimes?: boolean; showCurrency?: boolean; decimals?: number } = {}
): string {
  const { isCentimes = false, showCurrency = true, decimals = 2 } = options;
  const numericDzd = isCentimes ? centimesToDzd(amount) : amount;
  const safe = Number.isFinite(numericDzd) ? numericDzd : 0;

  const formattedNumber = new Intl.NumberFormat('fr-DZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(safe)
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ');

  return showCurrency ? `${formattedNumber} DZD` : formattedNumber;
}

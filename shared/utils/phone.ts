/**
 * Algeria Phone Number Normalization & Validation Utility
 * Supports Algerian mobile & landline prefixes:
 * - Ooredoo (05xx)
 * - Mobilis (06xx)
 * - Djezzy (07xx)
 * - Fixe / Landline (02x, 03x, 04x)
 * Standardizes numbers to E.164 (+213...) format.
 */

export interface PhoneValidationResult {
  isValid: boolean;
  raw: string;
  e164: string;
  national: string;
  operator: 'Ooredoo' | 'Mobilis' | 'Djezzy' | 'Fixe' | 'Inconnu';
  carrier: 'Ooredoo' | 'Mobilis' | 'Djezzy' | 'Fixe' | 'Inconnu';
  prefix: string;
  error?: string;
  note?: string;
}

export function normalizeAlgerianPhone(raw: string | null | undefined): PhoneValidationResult {
  if (!raw || !raw.trim()) {
    return {
      isValid: false,
      raw: raw || '',
      e164: '',
      national: '',
      operator: 'Inconnu',
      carrier: 'Inconnu',
      prefix: '',
      error: 'Numéro de téléphone vide',
    };
  }

  let cleaned = raw.trim().replace(/[\s\-\.\(\)\\\/]/g, '');

  while (cleaned.startsWith('+213') || cleaned.startsWith('00213') || cleaned.startsWith('213')) {
    if (cleaned.startsWith('+213')) {
      cleaned = cleaned.substring(4);
    } else if (cleaned.startsWith('00213')) {
      cleaned = cleaned.substring(5);
    } else if (cleaned.startsWith('213') && cleaned.length > 9) {
      cleaned = cleaned.substring(3);
    } else {
      break;
    }
  }

  while (cleaned.startsWith('0') && cleaned.length > 9) {
    cleaned = cleaned.substring(1);
  }
  if (cleaned.startsWith('0') && (cleaned.length === 10 || (cleaned.length === 9 && /^0[234]/.test(cleaned)))) {
    cleaned = cleaned.substring(1);
  }

  const isShortLandline = /^[234]\d{7}$/.test(cleaned);
  if (!/^\d{9}$/.test(cleaned) && !isShortLandline) {
    return {
      isValid: false,
      raw,
      e164: raw,
      national: raw,
      operator: 'Inconnu',
      carrier: 'Inconnu',
      prefix: cleaned.substring(0, 2),
      error: !/^\d+$/.test(cleaned)
        ? 'Le numéro contient des caractères non numériques'
        : cleaned.length < 8
        ? `Numéro trop court (${cleaned.length} chiffres)`
        : `Numéro trop long (${cleaned.length} chiffres)`,
    };
  }

  const firstDigit = cleaned.charAt(0);
  let operator: PhoneValidationResult['operator'] = 'Inconnu';

  switch (firstDigit) {
    case '5':
      operator = 'Ooredoo';
      break;
    case '6':
      operator = 'Mobilis';
      break;
    case '7':
      operator = 'Djezzy';
      break;
    case '2':
    case '3':
    case '4':
      operator = 'Fixe';
      break;
    default:
      return {
        isValid: false,
        raw,
        e164: `+213${cleaned}`,
        national: `0${cleaned}`,
        operator: 'Inconnu',
        carrier: 'Inconnu',
        prefix: cleaned.substring(0, 2),
        error: 'Préfixe opérateur non attribué (les mobiles algériens commencent par 05, 06 ou 07)',
      };
  }

  const e164 = `+213${cleaned}`;
  const national =
    cleaned.length === 8
      ? `0${cleaned.substring(0, 2)} ${cleaned.substring(2, 4)} ${cleaned.substring(4, 6)} ${cleaned.substring(6, 8)}`
      : `0${cleaned.substring(0, 3)} ${cleaned.substring(3, 5)} ${cleaned.substring(5, 7)} ${cleaned.substring(7, 9)}`;

  return {
    isValid: true,
    raw,
    e164,
    national,
    operator,
    carrier: operator,
    prefix: `0${cleaned.substring(0, 2)}`,
    note: 'Opérateur identifié par préfixe historique (sans garantie de portabilité MNP active)',
  };
}

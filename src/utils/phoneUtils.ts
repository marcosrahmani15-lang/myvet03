import { normalizeAlgerianPhone, type PhoneValidationResult } from '../../shared/utils/phone.ts';

export type PhoneValidation = PhoneValidationResult;

export function formatAlgerianPhone(input: string): PhoneValidationResult {
  return normalizeAlgerianPhone(input);
}

export { normalizeAlgerianPhone };

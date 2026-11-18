import { describe, expect, it } from 'vitest';
import {
  CURRENCY_CODE,
  centimesToDzd,
  dzdToCentimes,
  formatDzd,
  sumCentimes,
} from '../shared/utils/money.ts';
import { normalizeAlgerianPhone } from '../shared/utils/phone.ts';
import { analyzeSMSContent } from '../shared/utils/smsSegmentation.ts';
import {
  appointmentCreateSchema,
  cashClosingCreateSchema,
  invoiceCreateSchema,
  ownerCreateSchema,
} from '../shared/schemas/index.ts';

describe('DZD Monetary Arithmetic & Formatting', () => {
  it('uses DZD as canonical currency code and converts without floating-point drift', () => {
    expect(CURRENCY_CODE).toBe('DZD');
    expect(dzdToCentimes(0.1) + dzdToCentimes(0.2)).toBe(30);
    expect(centimesToDzd(sumCentimes([dzdToCentimes(0.1), dzdToCentimes(0.2)]))).toBe(0.3);

    expect(dzdToCentimes('3500,50')).toBe(350050);
    expect(dzdToCentimes('12 500.75')).toBe(1250075);
    expect(dzdToCentimes('99.995')).toBe(10000);
    expect(dzdToCentimes(-250.25)).toBe(-25025);
    expect(dzdToCentimes(null)).toBe(0);
  });

  it('formats DZD amounts cleanly for display without residual Euro symbol', () => {
    const out = formatDzd(12500);
    expect(out).toContain('DZD');
    expect(out).not.toContain('€');

    const fromCentimes = formatDzd(350050, { isCentimes: true, decimals: 2 });
    expect(fromCentimes).toContain('DZD');
    expect(fromCentimes).toMatch(/3\s?500/);
  });

  it('throws on invalid monetary strings or non-finite numbers', () => {
    expect(() => dzdToCentimes('abc')).toThrow();
    expect(() => dzdToCentimes(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('Algerian Phone Normalization (+213 E.164)', () => {
  it('normalizes Ooredoo, Mobilis, Djezzy and landline numbers cleanly', () => {
    const ooredoo = normalizeAlgerianPhone('0555 55 55 55');
    expect(ooredoo.isValid).toBe(true);
    expect(ooredoo.e164).toBe('+213555555555');
    expect(ooredoo.operator).toBe('Ooredoo');
    expect(ooredoo.national).toBe('0555 55 55 55');

    const mobilis = normalizeAlgerianPhone('+213 612-34-56-78');
    expect(mobilis.isValid).toBe(true);
    expect(mobilis.e164).toBe('+213612345678');
    expect(mobilis.operator).toBe('Mobilis');

    const djezzy = normalizeAlgerianPhone('00213770456789');
    expect(djezzy.isValid).toBe(true);
    expect(djezzy.e164).toBe('+213770456789');
    expect(djezzy.operator).toBe('Djezzy');

    const fixe = normalizeAlgerianPhone('021 45 67 89');
    expect(fixe.isValid).toBe(true);
    expect(fixe.operator).toBe('Fixe');
  });

  it('rejects malformed or unassigned Algerian numbers', () => {
    expect(normalizeAlgerianPhone('').isValid).toBe(false);
    expect(normalizeAlgerianPhone('0555 12').isValid).toBe(false);
    expect(normalizeAlgerianPhone('0955 12 34 56').isValid).toBe(false);
    expect(normalizeAlgerianPhone('+33612345678').isValid).toBe(false);
  });
});

describe('3GPP GSM-7 / UCS-2 SMS Segmentation', () => {
  it('calculates GSM-7 single and concatenated segments accurately', () => {
    const shortMsg = analyzeSMSContent('Cabinet My Vet: RDV demain 09h00.');
    expect(shortMsg.encoding).toBe('GSM-7');
    expect(shortMsg.segmentCount).toBe(1);
    expect(shortMsg.isConcatenated).toBe(false);

    const longGsm = 'a'.repeat(161);
    const multi = analyzeSMSContent(longGsm);
    expect(multi.encoding).toBe('GSM-7');
    expect(multi.segmentCount).toBe(2);
    expect(multi.isConcatenated).toBe(true);
    expect(multi.maxPerSegment).toBe(153);
  });

  it('switches to UCS-2 when Arabic or emoji characters are used', () => {
    const arabicMsg = analyzeSMSContent('عيادة ماي فيت: تذكير بموعد التلقيح غداً');
    expect(arabicMsg.encoding).toBe('UCS-2 (Unicode)');
    expect(arabicMsg.containsUnicode).toBe(true);
    expect(arabicMsg.segmentCount).toBe(1);

    const longUnicode = 'ت'.repeat(71);
    const multiUnicode = analyzeSMSContent(longUnicode);
    expect(multiUnicode.encoding).toBe('UCS-2 (Unicode)');
    expect(multiUnicode.segmentCount).toBe(2);
    expect(multiUnicode.maxPerSegment).toBe(67);
  });
});

describe('Zod Schema Validation', () => {
  it('rejects invalid owner phones and enforces appointment endTime > startTime', () => {
    const badOwner = ownerCreateSchema.safeParse({
      name: 'Test Client',
      phone: '12345',
    });
    expect(badOwner.success).toBe(false);

    const badAppointment = appointmentCreateSchema.safeParse({
      patientId: 'nina',
      date: '2026-08-20',
      startTime: '14:00',
      endTime: '13:30',
      type: 'Consultation',
      reason: 'Contrôle',
      veterinarian: 'Dr. Vétérinaire',
    });
    expect(badAppointment.success).toBe(false);
  });

  it('accepts valid DZD invoice and cash closing payloads', () => {
    const inv = invoiceCreateSchema.safeParse({
      clientName: 'Fatima Mansouri',
      patientName: 'Nina',
      amountDzd: 4500,
      paymentMethod: 'Espèces',
    });
    expect(inv.success).toBe(true);

    const closing = cashClosingCreateSchema.safeParse({
      closingDate: '2026-08-14',
      countedCashDzd: 3500,
      countedCbDzd: 5500,
      countedCheckTransferDzd: 0,
    });
    expect(closing.success).toBe(true);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateClientSmsSegments } from './smsCalc';
import { formatAlgerianPhone } from './phoneUtils';

test('smsCalc calculates GSM-7 single segment correctly', () => {
  const result = calculateClientSmsSegments('Rappel rendez-vous MyVet pour Minouche');
  assert.equal(result.encoding, 'GSM-7');
  assert.equal(result.segmentCount, 1);
  assert.equal(result.containsUnicode, false);
  assert.equal(result.hasNonGsmChars, false);
  assert.ok(result.remainingInSegment > 0);
});

test('smsCalc detects Unicode emoji or special characters', () => {
  const result = calculateClientSmsSegments('Rappel vaccin pour Minouche 🐱');
  assert.equal(result.encoding, 'UCS-2 (Unicode)');
  assert.equal(result.containsUnicode, true);
  assert.equal(result.hasNonGsmChars, true);
  assert.ok(result.nonGsmCharacters.includes('🐱'));
});

test('smsCalc handles empty string', () => {
  const result = calculateClientSmsSegments('');
  assert.equal(result.segmentCount, 0);
  assert.equal(result.characterCount, 0);
});

test('phoneUtils normalizes and detects Algerian mobile carriers', () => {
  const ooredoo = formatAlgerianPhone('0550 12 34 56');
  assert.equal(ooredoo.isValid, true);
  assert.equal(ooredoo.carrier, 'Ooredoo');
  assert.equal(ooredoo.e164, '+213550123456');

  const mobilis = formatAlgerianPhone('+213661001122');
  assert.equal(mobilis.isValid, true);
  assert.equal(mobilis.carrier, 'Mobilis');
  assert.equal(mobilis.e164, '+213661001122');

  const djezzy = formatAlgerianPhone('0771 99 88 77');
  assert.equal(djezzy.isValid, true);
  assert.equal(djezzy.carrier, 'Djezzy');
  assert.equal(djezzy.e164, '+213771998877');
});

test('phoneUtils rejects invalid numbers', () => {
  const invalid = formatAlgerianPhone('12345');
  assert.equal(invalid.isValid, false);
});

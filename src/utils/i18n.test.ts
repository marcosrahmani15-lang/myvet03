import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRANSLATIONS,
  LANGUAGE_OPTIONS,
  getLanguageDir,
  getLocaleCode,
  parseStoredLanguage,
  translateDomain,
  formatMoneyDzd,
} from '../i18n';

function collectLeafKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  if (Array.isArray(obj)) {
    return obj.flatMap((v, idx) => collectLeafKeys(v, `${prefix}[${idx}]`));
  }
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) =>
      collectLeafKeys(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return [];
}

function getLeafValue(obj: Record<string, any>, dotPath: string): unknown {
  const parts = dotPath.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur: any = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

test('language metadata and direction mapping', () => {
  assert.equal(getLanguageDir('fr'), 'ltr');
  assert.equal(getLanguageDir('en'), 'ltr');
  assert.equal(getLanguageDir('ar'), 'rtl');

  assert.equal(getLocaleCode('fr'), 'fr-FR');
  assert.equal(getLocaleCode('en'), 'en-US');
  assert.equal(getLocaleCode('ar'), 'ar-DZ');

  assert.equal(LANGUAGE_OPTIONS.length, 3);
  assert.deepEqual(
    LANGUAGE_OPTIONS.map((o) => o.code),
    ['fr', 'en', 'ar']
  );
});

test('parseStoredLanguage safely defaults invalid values to fr', () => {
  assert.equal(parseStoredLanguage('fr'), 'fr');
  assert.equal(parseStoredLanguage('en'), 'en');
  assert.equal(parseStoredLanguage('ar'), 'ar');
  assert.equal(parseStoredLanguage('es'), 'fr');
  assert.equal(parseStoredLanguage(null), 'fr');
  assert.equal(parseStoredLanguage(undefined), 'fr');
});

test('all dictionaries have 100% key parity and non-empty strings', () => {
  const frKeys = collectLeafKeys(TRANSLATIONS.fr).sort();
  const enKeys = collectLeafKeys(TRANSLATIONS.en).sort();
  const arKeys = collectLeafKeys(TRANSLATIONS.ar).sort();

  assert.deepEqual(enKeys, frKeys);
  assert.deepEqual(arKeys, frKeys);

  for (const key of frKeys) {
    for (const lang of ['fr', 'en', 'ar'] as const) {
      const val = getLeafValue(TRANSLATIONS[lang], key);
      assert.equal(typeof val, 'string', `Expected string at ${lang}.${key}`);
      assert.ok((val as string).trim().length > 0, `Empty translation at ${lang}.${key}`);
    }
  }
});

test('translateDomain translates canonical French DB enums cleanly into en and ar', () => {
  assert.equal(translateDomain('fr', 'species', 'Chien'), 'Chien');
  assert.equal(translateDomain('en', 'species', 'Chien'), 'Dog');
  assert.equal(translateDomain('ar', 'species', 'Chien'), 'كلب');

  assert.equal(translateDomain('en', 'appointmentStatus', 'Confirmé'), 'Confirmed');
  assert.equal(translateDomain('ar', 'appointmentStatus', 'Confirmé'), 'مؤكد');

  assert.equal(translateDomain('en', 'invoiceStatus', 'Payée'), 'Paid');
  assert.equal(translateDomain('ar', 'invoiceStatus', 'Payée'), 'مدفوعة');

  assert.equal(translateDomain('en', 'paymentMethod', 'Espèces'), 'Cash');
  assert.equal(translateDomain('ar', 'paymentMethod', 'Espèces'), 'نقداً');
});

test('formatMoneyDzd formats currency suffix cleanly per language', () => {
  assert.ok(formatMoneyDzd(2500, 'fr').endsWith('DA'));
  assert.ok(formatMoneyDzd(2500, 'en').endsWith('DZD'));
  assert.ok(formatMoneyDzd(2500, 'ar').endsWith('دج'));
});

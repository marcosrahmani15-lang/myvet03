import { fr } from './fr';
import { en } from './en';
import { ar } from './ar';
import { AppLanguage, TextDirection, TranslationDictionary } from './types';

export type { AppLanguage, TextDirection, TranslationDictionary } from './types';

export const LANGUAGE_STORAGE_KEY = 'myvet:language';
export const DEFAULT_LANGUAGE: AppLanguage = 'fr';

export const TRANSLATIONS: Record<AppLanguage, TranslationDictionary> = {
  fr,
  en,
  ar,
};

export interface LanguageOption {
  code: AppLanguage;
  nativeLabel: string;
  shortLabel: string;
  dir: TextDirection;
  locale: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'fr', nativeLabel: 'Français', shortLabel: 'FR', dir: 'ltr', locale: 'fr-FR' },
  { code: 'en', nativeLabel: 'English', shortLabel: 'EN', dir: 'ltr', locale: 'en-US' },
  { code: 'ar', nativeLabel: 'العربية', shortLabel: 'AR', dir: 'rtl', locale: 'ar-DZ' },
];

export function isSupportedLanguage(val: unknown): val is AppLanguage {
  return val === 'fr' || val === 'en' || val === 'ar';
}

export function parseStoredLanguage(val: unknown): AppLanguage {
  return isSupportedLanguage(val) ? val : DEFAULT_LANGUAGE;
}

export function getLanguageDir(lang: AppLanguage): TextDirection {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function getLocaleCode(lang: AppLanguage): string {
  switch (lang) {
    case 'ar':
      return 'ar-DZ';
    case 'en':
      return 'en-US';
    case 'fr':
    default:
      return 'fr-FR';
  }
}

export type DomainCategory = keyof TranslationDictionary['domain'];

export function translateDomain(
  lang: AppLanguage,
  category: DomainCategory,
  value: string | undefined | null
): string {
  if (!value) return '';
  const dict = TRANSLATIONS[lang]?.domain?.[category] as Record<string, string> | undefined;
  return dict?.[value] ?? value;
}

export function formatMoneyDzd(amount: number, lang: AppLanguage): string {
  const num = Number.isFinite(amount) ? amount : 0;
  const formatted = num.toLocaleString(lang === 'ar' ? 'fr-FR' : getLocaleCode(lang));
  return `${formatted} ${TRANSLATIONS[lang].common.dzd}`;
}

export function formatLocalizedDate(
  isoDate: string | Date,
  lang: AppLanguage,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
): string {
  const dateObj = isoDate instanceof Date ? isoDate : new Date(isoDate);
  if (Number.isNaN(dateObj.getTime())) {
    return typeof isoDate === 'string' ? isoDate : '';
  }
  const locale = lang === 'ar' ? 'ar-DZ-u-nu-latn' : getLocaleCode(lang);
  return dateObj.toLocaleDateString(locale, options);
}

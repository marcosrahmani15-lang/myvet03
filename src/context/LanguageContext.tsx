import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  AppLanguage,
  DomainCategory,
  LANGUAGE_STORAGE_KEY,
  TRANSLATIONS,
  TextDirection,
  TranslationDictionary,
  getLanguageDir,
  getLocaleCode,
  parseStoredLanguage,
  translateDomain,
} from '../i18n';

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  dir: TextDirection;
  isRtl: boolean;
  locale: string;
  t: TranslationDictionary;
  td: (category: DomainCategory, value: string | undefined | null) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readInitialLanguage(): AppLanguage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return parseStoredLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
    }
  } catch {
    // ignore storage errors
  }
  return 'fr';
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(readInitialLanguage);

  const dir = getLanguageDir(language);
  const isRtl = dir === 'rtl';
  const locale = getLocaleCode(language);

  useEffect(() => {
    const root = document.documentElement;
    root.dir = dir;
    root.lang = language;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // ignore storage errors
    }
  }, [language, dir]);

  const setLanguage = useCallback((lang: AppLanguage) => {
    setLanguageState(parseStoredLanguage(lang));
  }, []);

  const td = useCallback(
    (category: DomainCategory, value: string | undefined | null) =>
      translateDomain(language, category, value),
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      dir,
      isRtl,
      locale,
      t: TRANSLATIONS[language],
      td,
    }),
    [language, setLanguage, dir, isRtl, locale, td]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return ctx;
}

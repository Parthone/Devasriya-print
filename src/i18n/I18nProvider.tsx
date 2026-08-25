import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '@/constants/india';
import { I18nContext, type I18nContextValue } from '@/i18n/context';
import { translate, type TranslationKey } from '@/i18n/translations';

const STORAGE_KEY = 'devasriya-print.language';

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    // Storage disabled: the choice simply does not survive a reload.
    return null;
  }
}

/**
 * Holds the display language.
 *
 * Precedence is: what the person picked in this browser, then the language on
 * their customer record (`preferredLanguage` from Module 3), then the default.
 * An explicit choice wins because a customer who switches mid-review has just
 * told us more than their record does.
 */
export function I18nProvider({
  children,
  preferred,
}: {
  children: ReactNode;
  /** The signed-in customer's preferred language, when one is known. */
  preferred?: Language | undefined;
}) {
  const [chosen, setChosen] = useState<Language | null>(readStoredLanguage);

  const language = chosen ?? preferred ?? DEFAULT_LANGUAGE;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setChosen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best effort only.
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) =>
      translate(language, key, values),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

import { createContext } from 'react';

import type { Language } from '@/constants/india';
import type { TranslationKey } from '@/i18n/translations';

export interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextValue | undefined>(undefined);

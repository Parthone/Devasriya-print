import { createContext } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: Theme;
  /** The theme actually applied once "system" is resolved. */
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

export const THEME_STORAGE_KEY = 'devasriya-print.theme';

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

import { describe, expect, it } from 'vitest';

import { LANGUAGES } from '@/constants/india';
import { EN, HI, TRANSLATIONS, interpolate, translate } from '@/i18n/translations';

/**
 * The translation catalogue.
 *
 * The point of these is that a Hindi speaker never meets an English sentence
 * they did not ask for: every key has to exist in both languages, and it has to
 * actually be translated rather than copied across.
 */
describe('the catalogue', () => {
  it('covers every English key in Hindi', () => {
    const missing = Object.keys(EN).filter((key) => !(key in HI));
    expect(missing).toEqual([]);
  });

  it('carries no Hindi entries that English does not have', () => {
    const extra = Object.keys(HI).filter((key) => !(key in EN));
    expect(extra).toEqual([]);
  });

  it('has a non-empty string for every key in every language', () => {
    for (const language of LANGUAGES) {
      for (const [key, value] of Object.entries(TRANSLATIONS[language])) {
        expect(value.trim(), `${language}:${key}`).not.toBe('');
      }
    }
  });

  it('actually translates the customer-facing wording rather than copying it', () => {
    const identical = Object.keys(EN).filter(
      (key) =>
        key.startsWith('portal.') && HI[key as keyof typeof EN] === EN[key as keyof typeof EN],
    );
    expect(identical).toEqual([]);
  });

  it('is written in Devanagari on the Hindi side', () => {
    for (const [key, value] of Object.entries(HI)) {
      if (!key.startsWith('portal.')) continue;
      expect(/[\u0900-\u097F]/.test(value), `${key} should contain Hindi text`).toBe(true);
    }
  });

  it('keeps the same placeholders in both languages', () => {
    const placeholders = (value: string) => (value.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const key of Object.keys(EN) as (keyof typeof EN)[]) {
      expect(placeholders(HI[key]), key).toEqual(placeholders(EN[key]));
    }
  });
});

describe('looking a string up', () => {
  it('returns the wording for the language asked for', () => {
    expect(translate('en', 'portal.decision.approve')).toBe('Approve');
    expect(translate('hi', 'portal.decision.approve')).toBe('स्वीकृत करें');
  });

  it('fills in placeholders', () => {
    expect(translate('en', 'portal.home.version', { n: 3 })).toBe('Version 3');
    expect(translate('hi', 'portal.home.version', { n: 3 })).toBe('संस्करण 3');
  });

  it('leaves a placeholder alone when nothing was supplied for it', () => {
    expect(interpolate('Version {{n}}')).toBe('Version {{n}}');
    expect(interpolate('Version {{n}}', { other: 1 })).toBe('Version {{n}}');
  });
});

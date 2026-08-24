/**
 * Application-wide constants. Locale, currency and timezone are fixed for the
 * business and deliberately centralised here so no component hard-codes them.
 */
export const APP_CONFIG = {
  name: 'Devasriya Print',
  shortName: 'Devasriya',
  tagline: 'Printing & Advertising Job Management',
  locale: 'en-IN',
  currency: 'INR',
  currencySymbol: '\u20B9',
  timeZone: 'Asia/Kolkata',
  /** Financial year start month (1-12). India: April. */
  financialYearStartMonth: 4,
  /** Default page size for paginated lists. */
  defaultPageSize: 25,
  supportEmail: 'support@devasriyaprint.local',
} as const;

export type AppConfig = typeof APP_CONFIG;

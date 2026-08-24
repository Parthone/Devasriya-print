import { APP_CONFIG } from '@/config/app.config';

/**
 * Money is stored as an integer number of paise (1 rupee = 100 paise).
 *
 * Floating point rupees cannot represent 0.1 exactly, which silently corrupts
 * totals on invoices. Every amount in this system - rates, taxes, discounts,
 * payments - is an integer in the smallest currency unit.
 */
export interface Money {
  /** Integer amount in paise. May be negative (credits, adjustments). */
  paise: number;
  currency: typeof APP_CONFIG.currency;
}

export const ZERO_MONEY: Money = { paise: 0, currency: APP_CONFIG.currency };

export function money(paise: number): Money {
  assertSafeInteger(paise);
  return { paise, currency: APP_CONFIG.currency };
}

/** Build Money from a rupee value (e.g. a form input). Rounds to the paise. */
export function fromRupees(rupees: number): Money {
  if (!Number.isFinite(rupees)) {
    throw new TypeError(`Invalid rupee amount: ${String(rupees)}`);
  }
  return money(Math.round(rupees * 100));
}

/** Rupee value for display / export. Not for arithmetic. */
export function toRupees(value: Money): number {
  return value.paise / 100;
}

export function addMoney(...values: Money[]): Money {
  return money(values.reduce((total, value) => total + value.paise, 0));
}

export function subtractMoney(a: Money, b: Money): Money {
  return money(a.paise - b.paise);
}

/** Multiply by a quantity or rate (e.g. sq. ft. area). Rounds to the paise. */
export function multiplyMoney(value: Money, factor: number): Money {
  if (!Number.isFinite(factor)) {
    throw new TypeError(`Invalid factor: ${String(factor)}`);
  }
  return money(Math.round(value.paise * factor));
}

/** Percentage of an amount, e.g. GST or a discount. */
export function percentOfMoney(value: Money, percent: number): Money {
  return multiplyMoney(value, percent / 100);
}

export function isZeroMoney(value: Money): boolean {
  return value.paise === 0;
}

export function compareMoney(a: Money, b: Money): number {
  return a.paise - b.paise;
}

function assertSafeInteger(paise: number): void {
  if (!Number.isSafeInteger(paise)) {
    throw new TypeError(`Money must be a safe integer number of paise, received: ${String(paise)}`);
  }
}

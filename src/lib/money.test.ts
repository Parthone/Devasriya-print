import { describe, expect, it } from 'vitest';

import {
  addMoney,
  fromRupees,
  money,
  multiplyMoney,
  percentOfMoney,
  subtractMoney,
  toRupees,
} from '@/lib/money';

describe('money', () => {
  it('stores rupees as integer paise', () => {
    expect(fromRupees(1250.5)).toEqual({ paise: 125050, currency: 'INR' });
    expect(toRupees(money(125050))).toBe(1250.5);
  });

  it('adds without floating point drift', () => {
    const total = addMoney(fromRupees(0.1), fromRupees(0.2));
    expect(total.paise).toBe(30);
    expect(toRupees(total)).toBe(0.3);
  });

  it('subtracts and allows negative balances', () => {
    expect(subtractMoney(fromRupees(500), fromRupees(750)).paise).toBe(-25000);
  });

  it('multiplies by an area or quantity and rounds to the paise', () => {
    // 12.5 sq ft at Rs 45.50 per sq ft
    expect(multiplyMoney(fromRupees(45.5), 12.5).paise).toBe(56875);
  });

  it('computes a percentage such as GST', () => {
    expect(percentOfMoney(fromRupees(1000), 18).paise).toBe(18000);
  });

  it('rejects unsafe amounts', () => {
    expect(() => money(1.5)).toThrow(TypeError);
    expect(() => fromRupees(Number.NaN)).toThrow(TypeError);
  });
});

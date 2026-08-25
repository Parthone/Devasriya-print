import { describe, expect, it } from 'vitest';

import {
  convertMeasurement,
  formatMeasurement,
  fromMicrometres,
  isValidMeasurement,
  MICROMETRES_PER_UNIT,
  toMicrometres,
  type MeasurementUnit,
} from '@/lib/measurement';

describe('unit conversion to micrometres', () => {
  it('converts each unit by its exact integer factor', () => {
    expect(toMicrometres(1, 'mm')).toBe(1_000n);
    expect(toMicrometres(1, 'cm')).toBe(10_000n);
    expect(toMicrometres(1, 'inch')).toBe(25_400n);
    expect(toMicrometres(1, 'foot')).toBe(304_800n);
    expect(toMicrometres(1, 'meter')).toBe(1_000_000n);
  });

  it('keeps imperial conversions exact', () => {
    // 6 ft is exactly 1.8288 m, with no floating point residue.
    expect(toMicrometres(6, 'foot')).toBe(1_828_800n);
    expect(toMicrometres(12, 'inch')).toBe(toMicrometres(1, 'foot'));
    expect(toMicrometres(3, 'foot')).toBe(toMicrometres(36, 'inch'));
  });

  it('handles decimal measurements exactly', () => {
    expect(toMicrometres(6.5, 'foot')).toBe(1_981_200n);
    expect(toMicrometres(120.25, 'cm')).toBe(1_202_500n);
    expect(toMicrometres(0.1, 'mm')).toBe(100n);
    // 0.1 + 0.2 in floating point is 0.30000000000000004; not here.
    expect(toMicrometres(0.1, 'meter') + toMicrometres(0.2, 'meter')).toBe(
      toMicrometres(0.3, 'meter'),
    );
  });

  it('rejects values that are not real numbers', () => {
    expect(() => toMicrometres(Number.NaN, 'foot')).toThrow(TypeError);
    expect(() => toMicrometres(Number.POSITIVE_INFINITY, 'cm')).toThrow(TypeError);
  });
});

describe('conversion between units', () => {
  const cases: [number, MeasurementUnit, MeasurementUnit, number][] = [
    [1, 'foot', 'inch', 12],
    [1, 'inch', 'mm', 25.4],
    [1, 'meter', 'cm', 100],
    [100, 'cm', 'meter', 1],
    [1000, 'mm', 'meter', 1],
    [3, 'foot', 'meter', 0.9144],
    [2.5, 'meter', 'foot', 8.2020997375],
    [120, 'cm', 'foot', 3.937007874],
  ];

  it.each(cases)('converts %s %s to %s', (value, from, to, expected) => {
    expect(convertMeasurement(value, from, to)).toBeCloseTo(expected, 6);
  });

  it('round-trips through the base unit', () => {
    for (const unit of Object.keys(MICROMETRES_PER_UNIT) as MeasurementUnit[]) {
      expect(fromMicrometres(toMicrometres(7.25, unit), unit)).toBeCloseTo(7.25, 6);
    }
  });
});

describe('measurement helpers', () => {
  it('accepts only positive measurements', () => {
    expect(isValidMeasurement(6)).toBe(true);
    expect(isValidMeasurement(0.5)).toBe(true);
    expect(isValidMeasurement(0)).toBe(false);
    expect(isValidMeasurement(-3)).toBe(false);
    expect(isValidMeasurement(Number.NaN)).toBe(false);
  });

  it('formats with the short unit name', () => {
    expect(formatMeasurement(6, 'foot')).toBe('6 ft');
    expect(formatMeasurement(120.5, 'cm')).toBe('120.5 cm');
  });
});

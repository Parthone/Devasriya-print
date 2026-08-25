import { describe, expect, it } from 'vitest';

import { formatMoney } from '@/lib/format';
import { fromRupees, money, toRupees } from '@/lib/money';
import {
  calculateLine,
  describeLineCalculation,
  MAX_PRICING_LINES,
  summarisePricing,
  type PricingLine,
  type PricingLineInput,
} from '@/lib/pricing';

function input(overrides: Partial<PricingLineInput> = {}): PricingLineInput {
  return {
    id: 'line-1',
    productId: null,
    productName: 'Flex print',
    pricingMethod: 'per-square-foot',
    measurementUnit: 'foot',
    quantity: 1,
    rate: fromRupees(25),
    ...overrides,
  };
}

function amountOf(result: ReturnType<typeof calculateLine>): number {
  if (!result.ok) throw new Error(`Expected a priced line, got ${result.code}`);
  return toRupees(result.line.lineAmount);
}

describe('square foot pricing', () => {
  it('prices the worked example: 6 ft x 4 ft at Rs 25/sq ft', () => {
    const result = calculateLine(input({ width: 6, height: 4 }));
    expect(amountOf(result)).toBe(600);
  });

  it('multiplies by quantity', () => {
    expect(amountOf(calculateLine(input({ width: 6, height: 4, quantity: 2 })))).toBe(1200);
    expect(amountOf(calculateLine(input({ width: 6, height: 4, quantity: 10 })))).toBe(6000);
  });

  it('converts the entered unit before pricing', () => {
    // 120 cm x 60 cm is 7.75 sq ft, at Rs 25 that is Rs 193.75.
    const result = calculateLine(
      input({ width: 120, height: 60, measurementUnit: 'cm', quantity: 1 }),
    );
    expect(amountOf(result)).toBeCloseTo(193.75, 2);
  });

  it('handles the audio example: 120 cm x 60 cm, quantity 10', () => {
    const result = calculateLine(
      input({ width: 120, height: 60, measurementUnit: 'cm', quantity: 10 }),
    );
    expect(amountOf(result)).toBeCloseTo(1937.5, 2);
  });

  it('stores the calculated area alongside the entered values', () => {
    const result = calculateLine(input({ width: 6, height: 4 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const line = result.line as Extract<PricingLine, { calculatedArea: number }>;
    expect(line.calculatedArea).toBe(24);
    expect(line.width).toBe(6);
    expect(line.height).toBe(4);
    expect(line.measurementUnit).toBe('foot');
    expect(line.rateUnit).toBe('sq-ft');
  });

  it('handles decimal measurements and decimal rates', () => {
    const result = calculateLine(input({ width: 6.5, height: 4.25, rate: fromRupees(24.5) }));
    // 27.625 sq ft at Rs 24.50 = Rs 676.8125, rounded half up to Rs 676.81.
    expect(amountOf(result)).toBe(676.81);
  });
});

describe('square metre pricing', () => {
  it('prices by the metre', () => {
    const result = calculateLine(
      input({
        pricingMethod: 'per-square-meter',
        measurementUnit: 'meter',
        width: 2,
        height: 1.5,
        rate: fromRupees(300),
      }),
    );
    expect(amountOf(result)).toBe(900);
  });

  it('converts feet into square metres', () => {
    const result = calculateLine(
      input({
        pricingMethod: 'per-square-meter',
        measurementUnit: 'foot',
        width: 10,
        height: 10,
        rate: fromRupees(100),
      }),
    );
    // 100 sq ft is 9.290304 sq m.
    expect(amountOf(result)).toBeCloseTo(929.03, 2);
  });
});

describe('running length pricing', () => {
  it('prices per running foot', () => {
    const result = calculateLine(
      input({ pricingMethod: 'per-running-foot', length: 12, rate: fromRupees(20) }),
    );
    expect(amountOf(result)).toBe(240);
  });

  it('prices per running metre', () => {
    const result = calculateLine(
      input({
        pricingMethod: 'per-running-meter',
        measurementUnit: 'meter',
        length: 4.5,
        rate: fromRupees(80),
      }),
    );
    expect(amountOf(result)).toBe(360);
  });

  it('converts units and applies quantity', () => {
    const result = calculateLine(
      input({
        pricingMethod: 'per-running-foot',
        measurementUnit: 'meter',
        length: 3,
        quantity: 2,
        rate: fromRupees(10),
      }),
    );
    // 3 m is 9.8425196... ft; two of them at Rs 10 is Rs 196.85.
    expect(amountOf(result)).toBeCloseTo(196.85, 2);
  });

  it('stores the calculated length', () => {
    const result = calculateLine(
      input({ pricingMethod: 'per-running-foot', length: 12, rate: fromRupees(20) }),
    );
    if (!result.ok) throw new Error('expected a line');
    const line = result.line as Extract<PricingLine, { calculatedLength: number }>;
    expect(line.calculatedLength).toBe(12);
    expect(line.rateUnit).toBe('running-ft');
  });
});

describe('piece and flat pricing', () => {
  it('prices per piece', () => {
    const result = calculateLine(
      input({ pricingMethod: 'per-piece', quantity: 50, rate: fromRupees(8) }),
    );
    expect(amountOf(result)).toBe(400);
  });

  it('prices a flat rate and ignores quantity', () => {
    const result = calculateLine(
      input({ pricingMethod: 'flat-rate', quantity: 7, rate: fromRupees(1500) }),
    );
    expect(amountOf(result)).toBe(1500);
    if (!result.ok) return;
    expect(result.line.quantity).toBe(1);
  });

  it('needs no dimensions for piece or flat lines', () => {
    expect(calculateLine(input({ pricingMethod: 'per-piece', quantity: 3 })).ok).toBe(true);
    expect(calculateLine(input({ pricingMethod: 'flat-rate' })).ok).toBe(true);
  });
});

describe('validation', () => {
  it('refuses zero or negative measurements', () => {
    expect(calculateLine(input({ width: 0, height: 4 }))).toMatchObject({
      code: 'invalid-measurement',
    });
    expect(calculateLine(input({ width: 6, height: -2 }))).toMatchObject({
      code: 'invalid-measurement',
    });
    expect(calculateLine(input({ pricingMethod: 'per-running-foot', length: 0 }))).toMatchObject({
      code: 'invalid-measurement',
    });
  });

  it('asks for the dimensions the method needs', () => {
    expect(calculateLine(input({ height: 4 }))).toMatchObject({ code: 'missing-width' });
    expect(calculateLine(input({ width: 6 }))).toMatchObject({ code: 'missing-height' });
    expect(calculateLine(input({ pricingMethod: 'per-running-meter' }))).toMatchObject({
      code: 'missing-length',
    });
  });

  it('refuses a fractional or zero quantity', () => {
    expect(calculateLine(input({ width: 6, height: 4, quantity: 0 }))).toMatchObject({
      code: 'invalid-quantity',
    });
    expect(calculateLine(input({ width: 6, height: 4, quantity: 1.5 }))).toMatchObject({
      code: 'invalid-quantity',
    });
    expect(calculateLine(input({ width: 6, height: 4, quantity: -2 }))).toMatchObject({
      code: 'invalid-quantity',
    });
  });

  it('refuses a negative rate and an empty description', () => {
    expect(calculateLine(input({ width: 6, height: 4, rate: money(-100) }))).toMatchObject({
      code: 'invalid-rate',
    });
    expect(calculateLine(input({ width: 6, height: 4, productName: '   ' }))).toMatchObject({
      code: 'missing-product-name',
    });
  });

  it('allows a zero rate, for a line included at no charge', () => {
    const result = calculateLine(input({ width: 6, height: 4, rate: money(0) }));
    expect(amountOf(result)).toBe(0);
  });
});

describe('rounding', () => {
  it('rounds exactly half a paise up, not down', () => {
    // Half a square foot at 1 paise per square foot is 0.5 paise.
    const half = calculateLine(input({ width: 1, height: 0.5, rate: money(1) }));
    if (!half.ok) throw new Error('expected a line');
    expect(half.line.lineAmount.paise).toBe(1);
  });

  it('rounds below half down', () => {
    const below = calculateLine(input({ width: 1, height: 0.4, rate: money(1) }));
    if (!below.ok) throw new Error('expected a line');
    expect(below.line.lineAmount.paise).toBe(0);
  });

  it('rounds just above half up', () => {
    const above = calculateLine(input({ width: 1, height: 0.6, rate: money(1) }));
    if (!above.ok) throw new Error('expected a line');
    expect(above.line.lineAmount.paise).toBe(1);
  });

  it('never produces a fractional paise', () => {
    const awkward = calculateLine(
      input({ width: 3.333, height: 7.777, rate: fromRupees(33.33), quantity: 3 }),
    );
    if (!awkward.ok) throw new Error('expected a line');
    expect(Number.isInteger(awkward.line.lineAmount.paise)).toBe(true);
  });

  it('keeps precision on large jobs that would overflow plain numbers', () => {
    const result = calculateLine(
      input({ width: 100, height: 100, quantity: 50, rate: fromRupees(999.99) }),
    );
    if (!result.ok) throw new Error('expected a line');
    // 10,000 sq ft x 50 x Rs 999.99 = Rs 499,995,000 exactly.
    expect(result.line.lineAmount.paise).toBe(49_999_500_000);
    expect(toRupees(result.line.lineAmount)).toBe(499_995_000);
  });

  it('is deterministic: the same input always gives the same paise', () => {
    const once = calculateLine(input({ width: 6.75, height: 4.33, rate: fromRupees(27.77) }));
    const twice = calculateLine(input({ width: 6.75, height: 4.33, rate: fromRupees(27.77) }));
    if (!once.ok || !twice.ok) throw new Error('expected lines');
    expect(once.line.lineAmount.paise).toBe(twice.line.lineAmount.paise);
  });
});

describe('job pricing summary', () => {
  function line(id: string, paise: number): PricingLine {
    const result = calculateLine(
      input({ id, pricingMethod: 'flat-rate', rate: money(paise), productName: `Line ${id}` }),
    );
    if (!result.ok) throw new Error('expected a line');
    return result.line;
  }

  it('sums lines exactly, with no drift', () => {
    const result = summarisePricing([line('a', 33_333), line('b', 33_333), line('c', 33_334)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pricing.subtotal.paise).toBe(100_000);
    expect(result.pricing.total.paise).toBe(100_000);
  });

  it('makes the subtotal exactly the sum of what the lines show', () => {
    const lines = [line('a', 1), line('b', 2), line('c', 7), line('d', 99_999)];
    const result = summarisePricing(lines);
    if (!result.ok) return;
    const manual = lines.reduce((sum, entry) => sum + entry.lineAmount.paise, 0);
    expect(result.pricing.subtotal.paise).toBe(manual);
  });

  it('applies a discount and a surcharge', () => {
    const discounted = summarisePricing([line('a', 100_000)], {
      amount: money(-20_000),
      reason: 'Repeat customer',
    });
    if (!discounted.ok) throw new Error('expected a summary');
    expect(discounted.pricing.total.paise).toBe(80_000);
    expect(discounted.pricing.adjustment?.reason).toBe('Repeat customer');

    const surcharged = summarisePricing([line('a', 100_000)], {
      amount: money(15_000),
      reason: 'Special handling',
    });
    if (!surcharged.ok) throw new Error('expected a summary');
    expect(surcharged.pricing.total.paise).toBe(115_000);
  });

  it('demands a reason for a non-zero adjustment', () => {
    expect(
      summarisePricing([line('a', 100_000)], { amount: money(-5_000), reason: '   ' }),
    ).toMatchObject({ code: 'missing-adjustment-reason' });
  });

  it('drops a zero adjustment rather than storing an empty one', () => {
    const result = summarisePricing([line('a', 100_000)], { amount: money(0), reason: '' });
    if (!result.ok) throw new Error('expected a summary');
    expect(result.pricing.adjustment).toBeNull();
    expect(result.pricing.total.paise).toBe(100_000);
  });

  it('refuses to let the total go below zero', () => {
    expect(
      summarisePricing([line('a', 50_000)], { amount: money(-60_000), reason: 'Too much' }),
    ).toMatchObject({ code: 'negative-total' });
  });

  it('allows a discount that lands exactly on zero', () => {
    const result = summarisePricing([line('a', 50_000)], {
      amount: money(-50_000),
      reason: 'Free of charge',
    });
    if (!result.ok) throw new Error('expected a summary');
    expect(result.pricing.total.paise).toBe(0);
  });

  it('caps the number of lines', () => {
    const many = Array.from({ length: MAX_PRICING_LINES }, (_, index) =>
      line(`line-${String(index)}`, 100),
    );
    expect(summarisePricing(many).ok).toBe(true);
    expect(summarisePricing([...many, line('one-too-many', 100)])).toMatchObject({
      code: 'too-many-lines',
    });
  });

  it('summarises an empty job as zero', () => {
    const result = summarisePricing([]);
    if (!result.ok) throw new Error('expected a summary');
    expect(result.pricing.subtotal.paise).toBe(0);
    expect(result.pricing.total.paise).toBe(0);
    expect(result.pricing.lines).toEqual([]);
  });
});

describe('showing the working', () => {
  it('describes an area line the way a customer would read it', () => {
    const result = calculateLine(input({ width: 6, height: 4, quantity: 2 }));
    if (!result.ok) throw new Error('expected a line');
    expect(describeLineCalculation(result.line, formatMoney)).toContain('6 x 4 foot x 2');
    expect(describeLineCalculation(result.line, formatMoney)).toContain('/sq ft');
  });

  it('describes running, piece and flat lines', () => {
    const running = calculateLine(
      input({ pricingMethod: 'per-running-foot', length: 12, rate: fromRupees(20) }),
    );
    const piece = calculateLine(
      input({ pricingMethod: 'per-piece', quantity: 50, rate: fromRupees(8) }),
    );
    const flat = calculateLine(input({ pricingMethod: 'flat-rate', rate: fromRupees(1500) }));

    if (!running.ok || !piece.ok || !flat.ok) throw new Error('expected lines');
    expect(describeLineCalculation(running.line, formatMoney)).toContain('12 foot');
    expect(describeLineCalculation(piece.line, formatMoney)).toContain('50 x');
    expect(describeLineCalculation(flat.line, formatMoney)).toContain('Flat');
  });
});

export const MEASUREMENT_UNITS = ['mm', 'cm', 'inch', 'foot', 'meter'] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const MEASUREMENT_UNIT_LABELS: Record<MeasurementUnit, string> = {
  mm: 'Millimetres',
  cm: 'Centimetres',
  inch: 'Inches',
  foot: 'Feet',
  meter: 'Metres',
};

export const MEASUREMENT_UNIT_SHORT: Record<MeasurementUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  inch: 'in',
  foot: 'ft',
  meter: 'm',
};

/**
 * Every measurement is normalised to whole micrometres.
 *
 * Each supported unit converts to micrometres by an exact integer factor - one
 * inch is exactly 25400 um - so a 6 foot banner is exactly 1828800 um with no
 * floating point drift anywhere in the chain. A micrometre is a thousandth of a
 * millimetre, far finer than any print job needs, so rounding an entered value
 * to whole micrometres loses nothing real.
 */
export const MICROMETRES_PER_UNIT: Record<MeasurementUnit, bigint> = {
  mm: 1_000n,
  cm: 10_000n,
  inch: 25_400n,
  foot: 304_800n,
  meter: 1_000_000n,
};

/** Entered values are accepted to this many decimal places. */
export const MEASUREMENT_DECIMALS = 4;

const SCALE = 10n ** BigInt(MEASUREMENT_DECIMALS);

/**
 * Converts an entered measurement to whole micrometres.
 *
 * The value is scaled to an integer first, so `12.7` is handled as `127000`
 * rather than as a binary fraction, and the conversion itself is integer maths.
 */
export function toMicrometres(value: number, unit: MeasurementUnit): bigint {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Invalid measurement: ${String(value)}`);
  }

  const scaled = BigInt(Math.round(value * Number(SCALE)));
  const product = scaled * MICROMETRES_PER_UNIT[unit];

  // Round half away from zero back down to whole micrometres.
  const half = SCALE / 2n;
  return product >= 0n ? (product + half) / SCALE : -((-product + half) / SCALE);
}

/** Micrometres back to a unit, as a number for display. */
export function fromMicrometres(micrometres: bigint, unit: MeasurementUnit): number {
  return Number(micrometres) / Number(MICROMETRES_PER_UNIT[unit]);
}

/** Converts directly between two units, through the micrometre base. */
export function convertMeasurement(
  value: number,
  from: MeasurementUnit,
  to: MeasurementUnit,
): number {
  return fromMicrometres(toMicrometres(value, from), to);
}

/** Formats a measurement for display, e.g. "6 ft" or "120.5 cm". */
export function formatMeasurement(value: number, unit: MeasurementUnit): string {
  const rounded = Number(value.toFixed(MEASUREMENT_DECIMALS));
  return `${String(rounded)} ${MEASUREMENT_UNIT_SHORT[unit]}`;
}

/** A measurement must be a positive number a person could actually enter. */
export function isValidMeasurement(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

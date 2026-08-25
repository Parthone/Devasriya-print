/**
 * Indian mobile number handling, shared by every module that stores a phone
 * number (employees, customers, and later suppliers).
 */

/** Ten digits starting 6-9, stored without the +91 country code. */
export const MOBILE_PATTERN = /^[6-9]\d{9}$/;

/** Accepts "+91 98765 43210", "098765-43210" etc. and returns "9876543210". */
export function normaliseMobile(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(-10);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function isValidMobile(value: string): boolean {
  return MOBILE_PATTERN.test(normaliseMobile(value));
}

export function formatMobile(value: string): string {
  return MOBILE_PATTERN.test(value) ? `+91 ${value.slice(0, 5)} ${value.slice(5)}` : value;
}

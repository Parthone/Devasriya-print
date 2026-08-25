/**
 * Indian states and union territories, and the languages the software will
 * support. Kept as data so address forms and future reports group consistently.
 */
export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

/** Default for a business operating in Rajasthan. */
export const DEFAULT_STATE: IndianState = 'Rajasthan';

/** PIN codes are six digits and never start with zero. */
export const PINCODE_PATTERN = /^[1-9]\d{5}$/;

/**
 * GSTIN format: 2 digit state code, 10 character PAN, 1 entity digit, "Z",
 * 1 checksum character. The checksum itself is not verified.
 */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Languages the software will support. Customer records store the preference
 * now so the future customer portal can honour it.
 */
export const LANGUAGES = ['hi', 'en'] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  hi: 'Hindi',
  en: 'English',
};

export const DEFAULT_LANGUAGE: Language = 'hi';

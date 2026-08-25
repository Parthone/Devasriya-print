import { z } from 'zod';

import { DEPARTMENTS, DESIGNATIONS } from '@/constants/organization';
import { MOBILE_PATTERN, normaliseMobile } from '@/lib/phone';
import { USER_ROLES, type UserProfile } from '@/types/auth';
import { AppError } from '@/types/common';

// Phone handling is shared across modules; see src/lib/phone.ts.
export { MOBILE_PATTERN, formatMobile, normaliseMobile } from '@/lib/phone';

const mobileField = z
  .string()
  .trim()
  .min(1, 'Mobile number is required')
  .refine((value) => MOBILE_PATTERN.test(normaliseMobile(value)), {
    message: 'Enter a valid 10 digit mobile number',
  });

const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .max(200, 'Email is too long');

/**
 * Form input for creating or editing an employee.
 *
 * The schema deliberately performs no transforms, so form values and validated
 * values have the same type. Normalisation happens in `normaliseEmployeeValues`
 * just before the value is sent to the service layer.
 */
export const employeeFormSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120, 'Name is too long'),
  email: emailField,
  mobile: mobileField,
  designation: z.enum(DESIGNATIONS),
  department: z.enum(DEPARTMENTS),
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;
export type EmployeeInput = EmployeeFormValues;

/** Editing never changes the email - it is tied to the Supabase Auth account. */
export const employeeUpdateSchema = employeeFormSchema.omit({ email: true });
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

/** Trims, lower-cases the email and strips +91 / spaces from the mobile. */
export function normaliseEmployeeValues(values: EmployeeFormValues): EmployeeInput {
  return {
    ...values,
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    mobile: normaliseMobile(values.mobile),
  };
}

/** Shape of a stored profile row, validated at the data-access boundary. */
export const userProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().min(1),
  mobile: z.string(),
  designation: z.enum(DESIGNATIONS),
  department: z.enum(DEPARTMENTS),
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
  createdAt: z.date(),
  createdBy: z.string(),
  updatedAt: z.date(),
  updatedBy: z.string(),
});

/**
 * Parses a stored row into a UserProfile. A malformed row is a
 * data-integrity problem, so it fails loudly at the boundary rather than
 * leaking undefined fields into the UI.
 */
export function parseUserProfile(data: unknown, id: string): UserProfile {
  const result = userProfileSchema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      'invalid-input',
      `User profile "${id}" is malformed and cannot be loaded.`,
      result.error,
    );
  }
  return result.data;
}

import { z } from 'zod';
import { CONSENT_BASES, RECORD_TYPES, RELATIONSHIPS, CREDENTIAL_TYPES } from './enums';

/**
 * Normalises Malaysian numbers to E.164 (+60…). Accepts 012-345 6789, 0123456789,
 * 60123456789, +60123456789. Returns null when it cannot be a Malaysian number.
 */
export function normalizeMalaysianPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = '60' + digits.slice(1);
  else if (!digits.startsWith('60')) return null;
  const national = digits.slice(2);
  // Mobile: 1x + 7–8 digits; landline: 3–9 + 7–8 digits.
  if (!/^[1-9]\d{7,9}$/.test(national)) return null;
  return `+${digits}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .refine((v) => normalizeMalaysianPhone(v) !== null, 'Enter a valid Malaysian phone number')
  .transform((v) => normalizeMalaysianPhone(v)!);

export const optionalPhoneSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || normalizeMalaysianPhone(v) !== null, 'Enter a valid Malaysian phone number')
  .transform((v) => (v ? normalizeMalaysianPhone(v)! : undefined));

/** Matches Supabase auth config: ≥10 chars with lower, upper and digit. */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(100),
    email: emailSchema,
    phone: optionalPhoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    role: z.enum(['patient', 'therapist']).default('patient'),
    acceptTerms: z.literal(true, { error: 'You must accept the Terms of Service' }),
    acceptPdpa: z.literal(true, { error: 'You must consent to the use of your data (PDPA)' }),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(30).default('Home'),
  line1: z.string().trim().min(3, 'Enter your street address').max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().trim().min(2, 'Select the state'),
  postcode: z.string().trim().regex(/^\d{5}$/, 'Postcode must be 5 digits'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accessNotes: z.string().trim().max(300).optional(),
  isDefault: z.boolean().default(false),
});

export const familyMemberSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter their full name').max(100),
  relationship: z.enum(RELATIONSHIPS),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').optional().or(z.literal('')),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']).optional(),
  consentBasis: z.enum(CONSENT_BASES, { error: 'Confirm your authority to manage this profile' }),
});

export const medicalRecordSchema = z.object({
  recordType: z.enum(RECORD_TYPES),
  title: z.string().trim().min(2, 'Add a short title').max(120),
  description: z.string().trim().max(1000).optional(),
  onsetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD').optional().or(z.literal('')),
  severity: z.enum(['mild', 'moderate', 'severe']).optional(),
});

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name'),
  phone: phoneSchema,
  relationship: z.string().trim().min(2, 'Enter the relationship'),
});

export const therapistProfileSchema = z.object({
  headline: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(1500).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(70).optional(),
  qualifications: z.array(z.string().trim().min(2)).max(10),
  languages: z.array(z.string().trim().min(2)).min(1, 'Add at least one language').max(8),
});

export const credentialSchema = z.object({
  credentialType: z.enum(CREDENTIAL_TYPES),
  title: z.string().trim().min(2, 'Add a title'),
  issuer: z.string().trim().optional(),
  credentialNumber: z.string().trim().min(2, 'Enter the registration / certificate number'),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

export const availabilityWindowSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    locationType: z.enum(['clinic', 'home', 'both']),
  })
  .refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: 'End time must be after start time' });

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Choose a rating').max(5),
  comment: z.string().trim().max(2000).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AddressInput = z.infer<typeof addressSchema>;

/**
 * Typed access to EXPO_PUBLIC_* configuration. Only public, non-secret values belong here.
 * Expo inlines `process.env.EXPO_PUBLIC_*` at build time, so each key must be referenced literally.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  phoneAuthEnabled: process.env.EXPO_PUBLIC_PHONE_AUTH_ENABLED === 'true',
  easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? '',
  // Demo mode: one-tap entry for testers and stakeholders. OFF unless explicitly enabled for a test build.
  // Never enable on a project that holds real patient data: the demo logins are shipped inside the app bundle.
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === 'true',
  demoPatientEmail: process.env.EXPO_PUBLIC_DEMO_PATIENT_EMAIL ?? '',
  demoPatientPassword: process.env.EXPO_PUBLIC_DEMO_PATIENT_PASSWORD ?? '',
  demoPhysioEmail: process.env.EXPO_PUBLIC_DEMO_PHYSIO_EMAIL ?? '',
  demoPhysioPassword: process.env.EXPO_PUBLIC_DEMO_PHYSIO_PASSWORD ?? '',
};

export type DemoRole = 'patient' | 'therapist';

/** Demo accounts that are fully configured. Empty when demo mode is off. */
export const demoAccounts: Record<DemoRole, { email: string; password: string } | null> = {
  patient: env.demoMode && env.demoPatientEmail && env.demoPatientPassword ? { email: env.demoPatientEmail, password: env.demoPatientPassword } : null,
  therapist: env.demoMode && env.demoPhysioEmail && env.demoPhysioPassword ? { email: env.demoPhysioEmail, password: env.demoPhysioPassword } : null,
};

export const demoAvailable = Boolean(demoAccounts.patient || demoAccounts.therapist);

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

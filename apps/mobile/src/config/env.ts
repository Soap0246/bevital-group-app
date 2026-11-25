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
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

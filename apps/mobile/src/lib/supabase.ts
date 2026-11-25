import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '@/config/env';
import { authStorage } from './secureStorage';

/**
 * Single Supabase client for the whole app. Uses the public anon key only — every table is
 * protected by Row Level Security, and privileged operations are SECURITY DEFINER RPCs.
 *
 * When EXPO_PUBLIC_SUPABASE_* is missing the client is pointed at an unreachable local address so
 * the app still renders (the root layout shows a setup screen instead of making requests).
 */
export const supabase = createClient(
  env.supabaseUrl || 'http://127.0.0.1:54321',
  env.supabaseAnonKey || 'not-configured',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: isSupabaseConfigured,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);

// Only refresh tokens while the app is in the foreground (battery + security).
if (Platform.OS !== 'web' && isSupabaseConfigured) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

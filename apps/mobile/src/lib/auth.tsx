import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import type { TherapistProfileRow, UserRole, UserRow } from '@bevital/shared';
import { supabase } from './supabase';
import { isSupabaseConfigured } from '@/config/env';

export interface SignUpInput {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  role: 'patient' | 'therapist';
}

interface AuthContextValue {
  /** true until the stored session has been restored and the profile loaded */
  loading: boolean;
  session: Session | null;
  profile: UserRow | null;
  role: UserRole | null;
  therapist: TherapistProfileRow | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ needsEmailVerification: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  sendPhoneCode: (phone: string) => Promise<void>;
  verifyPhoneCode: (phone: string, code: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [therapist, setTherapist] = useState<TherapistProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | null) => {
    if (!userId) {
      setProfile(null);
      setTherapist(null);
      return;
    }
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    setProfile((user as UserRow | null) ?? null);
    if (user?.role === 'therapist') {
      const { data: tp } = await supabase.from('therapist_profiles').select('*').eq('user_id', userId).maybeSingle();
      setTherapist((tp as TherapistProfileRow | null) ?? null);
    } else {
      setTherapist(null);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id ?? null);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Defer to avoid deadlocks inside the auth callback (supabase-js guidance).
      setTimeout(() => {
        void loadProfile(next?.user.id ?? null);
      }, 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      profile,
      role: profile?.is_active === false ? null : (profile?.role ?? null),
      therapist,
      refreshProfile: () => loadProfile(session?.user.id ?? null),
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async ({ fullName, email, phone, password, role }) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role, phone },
            emailRedirectTo: Linking.createURL('auth/callback'),
          },
        });
        if (error) throw error;
        return { needsEmailVerification: !data.session };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: Linking.createURL('reset-password'),
        });
        if (error) throw error;
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      },
      resendVerification: async (email) => {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: Linking.createURL('auth/callback') },
        });
        if (error) throw error;
      },
      // Phone (SMS OTP) architecture — requires an SMS provider to be configured in Supabase.
      sendPhoneCode: async (phone) => {
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
      },
      verifyPhoneCode: async (phone, code) => {
        const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
        if (error) throw error;
      },
    }),
    [loading, session, profile, therapist, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Handles BeVital deep links from auth emails:
 *   bevital://auth/callback?code=…              (email verification, PKCE)
 *   bevital://reset-password?code=…             (password reset, PKCE)
 *   bevital://reset-password#access_token=…     (implicit flow fallback)
 * Returns the in-app route to open, or null if the URL is not an auth link.
 */
export async function handleAuthLink(url: string): Promise<'reset' | 'verified' | null> {
  if (!isSupabaseConfigured) return null;
  const parsed = Linking.parse(url);
  const path = parsed.path ?? '';
  const code = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : null;
  const fragment = url.includes('#') ? new URLSearchParams(url.split('#')[1]) : null;
  const isReset = path.startsWith('reset-password');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return null;
    return isReset ? 'reset' : 'verified';
  }
  if (fragment?.get('access_token') && fragment.get('refresh_token')) {
    const { error } = await supabase.auth.setSession({
      access_token: fragment.get('access_token')!,
      refresh_token: fragment.get('refresh_token')!,
    });
    if (error) return null;
    return fragment.get('type') === 'recovery' || isReset ? 'reset' : 'verified';
  }
  return null;
}

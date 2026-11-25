import React, { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { queryClient } from '@/lib/query';
import { A11yProvider } from '@/lib/a11y';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/ui';
import { isSupabaseConfigured } from '@/config/env';
import { FullScreenLoader, SetupScreen, SplashView } from '@/components/AppStates';
import { registerForPush } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Show a readable error (with retry) instead of a blank white page if any screen crashes.
export { ErrorBoundary } from 'expo-router';

function Navigator() {
  const { loading, session, role, profile } = useAuth();
  const router = useRouter();
  const wasSignedOut = useRef(false);

  // After an actual sign-in, go to the role's home (otherwise the router may pick an arbitrary open route).
  useEffect(() => {
    if (loading) return;
    if (!session) { wasSignedOut.current = true; return; }
    if (wasSignedOut.current && role) {
      wasSignedOut.current = false;
      router.replace(role === 'therapist' ? '/(therapist)/(tabs)' : role === 'patient' ? '/(patient)/(tabs)' : '/admin-notice');
    }
  }, [loading, session, role, router]);

  useEffect(() => {
    if (session?.user.id && role) void registerForPush(session.user.id).catch(() => {});
  }, [session?.user.id, role]);

  if (loading) return <SplashView />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      {/* Signed out: splash → onboarding → auth screens (these show Logo A) */}
      <Stack.Protected guard={!session}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* Signed in: the experience is chosen by role (these show Logo B) */}
      <Stack.Protected guard={role === 'patient'}>
        <Stack.Screen name="(patient)" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'therapist'}>
        <Stack.Screen name="(therapist)" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'admin'}>
        <Stack.Screen name="admin-notice" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !role && !!profile}>
        <Stack.Screen name="account-inactive" />
      </Stack.Protected>
      {/* Always reachable (deep links from emails) */}
      <Stack.Screen name="notifications" />
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return <FullScreenLoader />;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!isSupabaseConfigured ? (
        <SetupScreen />
      ) : (
        <QueryClientProvider client={queryClient}>
          <A11yProvider>
            <AuthProvider>
              <ToastProvider>
                <Navigator />
              </ToastProvider>
            </AuthProvider>
          </A11yProvider>
        </QueryClientProvider>
      )}
    </SafeAreaProvider>
  );
}

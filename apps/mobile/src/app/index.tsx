import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SplashView } from '@/components/AppStates';
import { ONBOARDING_KEY } from '@/config/storageKeys';



/** Signed-out entry point: branded splash, then onboarding (first launch) or login. */
export default function Splash() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      let seen = false;
      try { seen = (await AsyncStorage.getItem(ONBOARDING_KEY)) === '1'; } catch { /* storage unavailable */ }
      if (!cancelled) router.replace(seen ? '/(auth)/login' : '/welcome');
    }, 1600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [router]);
  return <SplashView />;
}

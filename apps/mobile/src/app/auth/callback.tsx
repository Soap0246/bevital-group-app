import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { handleAuthLink } from '@/lib/auth';
import { useToast } from '@/components/ui';
import { FullScreenLoader } from '@/components/AppStates';

/** bevital://auth/callback — email verification landing. */
export default function AuthCallback() {
  const router = useRouter();
  const url = Linking.useLinkingURL();
  const toast = useToast();

  useEffect(() => {
    if (!url) return;
    let active = true;
    (async () => {
      const result = await handleAuthLink(url);
      if (!active) return;
      if (result === 'verified') toast.show('Email verified. Welcome to BeVital!');
      router.replace(result === 'reset' ? '/reset-password' : '/');
    })();
    return () => { active = false; };
  }, [url, router, toast]);

  return <FullScreenLoader />;
}

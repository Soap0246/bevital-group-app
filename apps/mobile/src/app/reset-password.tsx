import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { friendlyError, resetPasswordSchema } from '@bevital/shared';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Input, useToast } from '@/components/ui';
import { handleAuthLink, useAuth } from '@/lib/auth';
import { useZodForm } from '@/lib/useZodForm';
import { FullScreenLoader } from '@/components/AppStates';

/** Opened from the password-reset email (bevital://reset-password?code=…). Exchanges the code, then sets a new password. */
export default function ResetPassword() {
  const router = useRouter();
  const url = Linking.useLinkingURL();
  const { session, updatePassword } = useAuth();
  const toast = useToast();
  const form = useZodForm(resetPasswordSchema, { password: '', confirmPassword: '' });
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (url && !session) await handleAuthLink(url);
      if (active) setChecking(false);
    })();
    return () => { active = false; };
  }, [url, session]);

  if (checking && !session) return <FullScreenLoader />;

  return (
    <AuthShell title="Choose a new password">
      {!session ? (
        <>
          <Banner tone="danger" icon="alert-circle" title="This link has expired or was already used" body="Request a new password reset email and open the newest link on this device." />
          <Button label="Request a new link" onPress={() => router.replace('/(auth)/forgot-password')} />
        </>
      ) : (
        <>
          {error ? <Banner tone="danger" icon="alert-circle" title={error} /> : null}
          <Input label="New password" value={form.values.password} onChangeText={(t) => form.set('password', t)} error={form.errors.password} secure autoCapitalize="none" textContentType="newPassword" icon="lock-closed-outline" />
          <Input label="Confirm new password" value={form.values.confirmPassword} onChangeText={(t) => form.set('confirmPassword', t)} error={form.errors.confirmPassword} secure autoCapitalize="none" textContentType="newPassword" icon="lock-closed-outline" />
          <Button label="Update password" loading={form.submitting} onPress={() => form.submit(async (v) => {
            setError(null);
            try { await updatePassword(v.password); toast.show('Password updated'); router.replace('/'); } catch (e) { setError(friendlyError(e)); }
          })} />
        </>
      )}
    </AuthShell>
  );
}

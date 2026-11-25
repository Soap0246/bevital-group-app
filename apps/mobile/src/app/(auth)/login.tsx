import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { friendlyError, loginSchema } from '@bevital/shared';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Input, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useZodForm } from '@/lib/useZodForm';
import { env } from '@/config/env';

export default function Login() {
  const router = useRouter();
  const { signIn, resendVerification } = useAuth();
  const toast = useToast();
  const form = useZodForm(loginSchema, { email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);

  const onSubmit = () =>
    form.submit(async (v) => {
      setError(null);
      setUnverified(false);
      try {
        await signIn(v.email, v.password);
      } catch (e) {
        const msg = friendlyError(e);
        setError(msg);
        setUnverified(/verify your email/i.test(msg));
      }
    });

  return (
    <AuthShell title="Welcome back" subtitle="Log in to book and manage your physiotherapy.">
      {error ? <Banner tone="danger" icon="alert-circle" title={error} /> : null}
      <Input label="Email" value={form.values.email} onChangeText={(t) => form.set('email', t)} error={form.errors.email}
        keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" icon="mail-outline" placeholder="you@example.com" />
      <Input label="Password" value={form.values.password} onChangeText={(t) => form.set('password', t)} error={form.errors.password}
        secure autoCapitalize="none" autoComplete="password" textContentType="password" icon="lock-closed-outline" placeholder="Your password" onSubmitEditing={onSubmit} />
      <Pressable accessibilityRole="link" onPress={() => router.push('/(auth)/forgot-password')} style={{ alignSelf: 'flex-end', paddingVertical: 4 }}>
        <Text variant="bodyStrong" color="primary">Forgot password?</Text>
      </Pressable>
      <Button label="Log in" onPress={onSubmit} loading={form.submitting} />
      {unverified ? (
        <Button label="Resend verification email" variant="secondary" onPress={async () => {
          try { await resendVerification(form.values.email); toast.show('Verification email sent'); } catch (e) { toast.show(friendlyError(e), 'error'); }
        }} />
      ) : null}
      {env.phoneAuthEnabled ? <Button label="Log in with phone number" variant="outline" icon="call-outline" onPress={() => router.push('/(auth)/phone')} /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 }}>
        <Text color="textMuted">New to BeVital?</Text>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/(auth)/register')} hitSlop={8}>
          <Text variant="bodyStrong" color="primary">Create an account</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

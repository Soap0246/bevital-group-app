import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { forgotPasswordSchema, friendlyError } from '@bevital/shared';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useZodForm } from '@/lib/useZodForm';

export default function ForgotPassword() {
  const router = useRouter();
  const { sendPasswordReset } = useAuth();
  const form = useZodForm(forgotPasswordSchema, { email: '' });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AuthShell back title="Reset your password" subtitle="Enter your email and we'll send you a secure link.">
      {sent ? (
        <>
          <Banner tone="success" icon="mail-open-outline" title="Check your inbox" body="If an account exists for that email, a reset link is on its way. Open the link on this device." />
          <Button label="Back to log in" variant="secondary" onPress={() => router.replace('/(auth)/login')} />
        </>
      ) : (
        <>
          {error ? <Banner tone="danger" icon="alert-circle" title={error} /> : null}
          <Input label="Email" value={form.values.email} onChangeText={(t) => form.set('email', t)} error={form.errors.email} keyboardType="email-address" autoCapitalize="none" icon="mail-outline" placeholder="you@example.com" />
          <Button label="Send reset link" loading={form.submitting} onPress={() => form.submit(async (v) => {
            setError(null);
            try { await sendPasswordReset(v.email); setSent(true); } catch (e) { setError(friendlyError(e)); }
          })} />
        </>
      )}
    </AuthShell>
  );
}

import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { friendlyError } from '@bevital/shared';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Icon, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function VerifyEmail() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { resendVerification } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  return (
    <AuthShell title="Verify your email" subtitle="One last step before you can log in.">
      <View style={{ alignItems: 'center', paddingVertical: 8 }}><Icon name="mail-unread-outline" size={64} color="primary" /></View>
      <Text align="center">We sent a verification link to <Text variant="bodyStrong">{email ?? 'your email'}</Text>. Open it on this device to activate your account.</Text>
      <Banner tone="info" icon="information-circle-outline" title="Can't find it?" body="Check your spam folder. The link expires after a short time." />
      <Button label="Resend email" variant="secondary" loading={busy} onPress={async () => {
        if (!email) return;
        setBusy(true);
        try { await resendVerification(email); toast.show('Verification email sent'); } catch (e) { toast.show(friendlyError(e), 'error'); } finally { setBusy(false); }
      }} />
      <Button label="Back to log in" variant="ghost" onPress={() => router.replace('/(auth)/login')} />
    </AuthShell>
  );
}

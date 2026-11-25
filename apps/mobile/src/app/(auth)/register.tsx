import React, { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { friendlyError, registerSchema } from '@bevital/shared';
import { AuthShell } from '@/components/AuthShell';
import { Banner, Button, Input, Segmented, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useZodForm } from '@/lib/useZodForm';
import { colors } from '@/theme';

function ConsentRow({ value, onChange, children, error }: { value: boolean; onChange: (v: boolean) => void; children: React.ReactNode; error?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} accessibilityRole="switch" />
        <View style={{ flex: 1 }}>{children}</View>
      </View>
      {error ? <Text variant="caption" color="danger">{error}</Text> : null}
    </View>
  );
}

export default function Register() {
  const router = useRouter();
  const { signUp } = useAuth();
  const form = useZodForm(registerSchema, {
    fullName: '', email: '', phone: '', password: '', confirmPassword: '', role: 'patient' as 'patient' | 'therapist',
    acceptTerms: false as boolean, acceptPdpa: false as boolean,
  });
  const [error, setError] = useState<string | null>(null);
  const isTherapist = form.values.role === 'therapist';

  const onSubmit = () =>
    form.submit(async (v) => {
      setError(null);
      try {
        const res = await signUp({ fullName: v.fullName, email: v.email, phone: v.phone, password: v.password, role: v.role });
        if (res.needsEmailVerification) router.replace({ pathname: '/(auth)/verify-email', params: { email: v.email } });
      } catch (e) {
        setError(friendlyError(e));
      }
    });

  return (
    <AuthShell title="Create your account" subtitle="It takes about a minute.">
      {error ? <Banner tone="danger" icon="alert-circle" title={error} /> : null}
      <Segmented
        value={form.values.role}
        onChange={(r) => form.set('role', r)}
        options={[{ value: 'patient', label: "I'm a patient", icon: 'person-outline' }, { value: 'therapist', label: "I'm a physio", icon: 'medkit-outline' }]}
      />
      {isTherapist ? <Banner tone="info" icon="shield-checkmark-outline" title="Physiotherapist accounts are verified" body="After signing up you will submit your registration and certificates. You appear to patients only once BeVital has verified them." /> : null}
      <Input label="Full name" value={form.values.fullName} onChangeText={(t) => form.set('fullName', t)} error={form.errors.fullName} autoComplete="name" textContentType="name" icon="person-outline" placeholder="As on your identity card" />
      <Input label="Email" value={form.values.email} onChangeText={(t) => form.set('email', t)} error={form.errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" icon="mail-outline" placeholder="you@example.com" />
      <Input label="Mobile number (optional)" value={form.values.phone} onChangeText={(t) => form.set('phone', t)} error={form.errors.phone} keyboardType="phone-pad" autoComplete="tel" icon="call-outline" placeholder="012-345 6789" hint="Malaysian numbers. Used for appointment updates." />
      <Input label="Password" value={form.values.password} onChangeText={(t) => form.set('password', t)} error={form.errors.password} secure autoCapitalize="none" textContentType="newPassword" icon="lock-closed-outline" hint="At least 10 characters with upper & lower case letters and a number." />
      <Input label="Confirm password" value={form.values.confirmPassword} onChangeText={(t) => form.set('confirmPassword', t)} error={form.errors.confirmPassword} secure autoCapitalize="none" textContentType="newPassword" icon="lock-closed-outline" />

      <ConsentRow value={form.values.acceptTerms} onChange={(v) => form.set('acceptTerms', v)} error={form.errors.acceptTerms}>
        <Text>I agree to the BeVital <Text variant="bodyStrong" color="primary">Terms of Service</Text>.</Text>
      </ConsentRow>
      <ConsentRow value={form.values.acceptPdpa} onChange={(v) => form.set('acceptPdpa', v)} error={form.errors.acceptPdpa}>
        <Text>I consent to BeVital collecting and processing my personal and health information to provide care, as described in the <Text variant="bodyStrong" color="primary">Privacy Notice (PDPA)</Text>.</Text>
      </ConsentRow>

      <Button label="Create account" onPress={onSubmit} loading={form.submitting} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <Text color="textMuted">Already registered?</Text>
        <Pressable accessibilityRole="link" onPress={() => router.replace('/(auth)/login')} hitSlop={8}>
          <Text variant="bodyStrong" color="primary">Log in</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

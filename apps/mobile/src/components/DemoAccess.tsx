import React, { useState } from 'react';
import { View } from 'react-native';
import { friendlyError } from '@bevital/shared';
import { Button, Text, useToast } from '@/components/ui';
import { demoAccounts, demoAvailable, type DemoRole } from '@/config/env';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

/** "Try the demo" entry points. Renders nothing unless the build has demo mode switched on. */
export function DemoAccess() {
  const { signInDemo } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<DemoRole | null>(null);
  if (!demoAvailable) return null;

  const enter = async (role: DemoRole) => {
    setBusy(role);
    try { await signInDemo(role); } catch (e) { toast.show(friendlyError(e), 'error'); setBusy(null); }
  };

  return (
    <View style={{ gap: 10, marginTop: 4 }} accessibilityLabel="Try the demo">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text variant="label" color="textMuted">OR TRY THE DEMO</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {demoAccounts.patient ? <Button label="As a patient" icon="person-outline" variant="secondary" size="md" fullWidth={false} style={{ flex: 1 }} loading={busy === 'patient'} disabled={busy !== null} onPress={() => enter('patient')} /> : null}
        {demoAccounts.therapist ? <Button label="As a physio" icon="medkit-outline" variant="secondary" size="md" fullWidth={false} style={{ flex: 1 }} loading={busy === 'therapist'} disabled={busy !== null} onPress={() => enter('therapist')} /> : null}
      </View>
      <Text variant="caption" color="textSubtle" align="center">No sign-up needed. Sample data only; nothing here is a real patient.</Text>
    </View>
  );
}

/** Small pill shown inside the app while a demo account is signed in. */
export function DemoPill() {
  const { isDemo } = useAuth();
  if (!isDemo) return null;
  return (
    <View accessible accessibilityLabel="Demo mode" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.accent }}>
      <Text variant="label" color="ink">DEMO MODE</Text>
    </View>
  );
}

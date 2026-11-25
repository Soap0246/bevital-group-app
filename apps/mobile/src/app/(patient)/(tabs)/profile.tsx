import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { friendlyError, phoneSchema } from '@bevital/shared';
import { useUpdateAccount } from '@/api/profile';
import { Avatar, Button, Card, Input, Logo, Row, Screen, Sheet, Text, useToast } from '@/components/ui';
import { useA11y } from '@/lib/a11y';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function Profile() {
  const router = useRouter();
  const toast = useToast();
  const { profile, session, signOut } = useAuth();
  const { largeText, setLargeText } = useA11y();
  const update = useUpdateAccount();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);
    const parsed = phone.trim() ? phoneSchema.safeParse(phone) : { success: true as const, data: null };
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Invalid phone number'); return; }
    if (name.trim().length < 2) { setErr('Enter your full name'); return; }
    try { await update.mutateAsync({ full_name: name.trim(), phone: parsed.data }); setEditing(false); toast.show('Profile updated'); } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <Screen header={<View style={{ paddingHorizontal: 20, paddingTop: 10 }}><Logo variant="nolb" height={40} /></View>}>
      <Card style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={profile?.full_name ?? '?'} size={64} />
        <View style={{ flex: 1 }}>
          <Text variant="heading" numberOfLines={1}>{profile?.full_name}</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>{session?.user.email}</Text>
          {profile?.phone ? <Text variant="caption" color="textMuted">{profile.phone}</Text> : null}
        </View>
        <Button label="Edit" variant="secondary" size="md" fullWidth={false} onPress={() => { setName(profile?.full_name ?? ''); setPhone(profile?.phone ?? ''); setEditing(true); }} />
      </Card>

      <Text variant="label" color="textMuted" style={{ marginTop: 24, marginBottom: 4 }}>MY HEALTH</Text>
      <Card padding={4} style={{ paddingHorizontal: 16 }}>
        <Row icon="heart-outline" title="Health profile" subtitle="Medical history, allergies, emergency contact" onPress={() => router.push('/health-profile')} />
        <Row icon="people-outline" title="Family accounts" subtitle="Book for children, parents and loved ones" onPress={() => router.push('/family')} />
        <Row icon="location-outline" title="My addresses" subtitle="For home physiotherapy" onPress={() => router.push('/addresses')} last />
      </Card>

      <Text variant="label" color="textMuted" style={{ marginTop: 24, marginBottom: 4 }}>PAYMENTS</Text>
      <Card padding={4} style={{ paddingHorizontal: 16 }}>
        <Row icon="receipt-outline" title="Payment history & receipts" onPress={() => router.push('/payments')} />
        <Row icon="ticket-outline" title="Packages & vouchers" onPress={() => router.push('/packages')} last />
      </Card>

      <Text variant="label" color="textMuted" style={{ marginTop: 24, marginBottom: 4 }}>PREFERENCES</Text>
      <Card padding={4} style={{ paddingHorizontal: 16 }}>
        <Row icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
        <Row icon="text-outline" title="Larger text" subtitle="Easier to read throughout the app"
          right={<Switch value={largeText} onValueChange={setLargeText} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} accessibilityLabel="Larger text" />} />
        <Row icon="shield-checkmark-outline" title="Privacy & data access" subtitle="Who can see your information" onPress={() => router.push('/privacy')} last />
      </Card>

      <View style={{ marginTop: 28, gap: 12 }}>
        <Button label="Log out" variant="outline" icon="log-out-outline" onPress={signOut} />
        <Text variant="caption" color="textSubtle" align="center">BeVital v0.1.0 · No One Left Behind</Text>
      </View>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit profile" footer={<Button label="Save changes" loading={update.isPending} onPress={save} />}>
        {err ? <Text color="danger">{err}</Text> : null}
        <Input label="Full name" value={name} onChangeText={setName} icon="person-outline" />
        <Input label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="call-outline" placeholder="012-345 6789" />
        <Text variant="caption" color="textMuted">To change your email address, contact support.</Text>
      </Sheet>
    </Screen>
  );
}

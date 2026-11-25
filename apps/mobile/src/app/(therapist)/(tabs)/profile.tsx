import React from 'react';
import { Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { VERIFICATION_LABELS, friendlyError, type StatusTone } from '@bevital/shared';
import { useUpdateTherapistProfile } from '@/api/therapist';
import { BrandHeader } from '@/components/domain/TherapistHeader';
import { Avatar, Badge, Button, Card, Row, Screen, Text, useToast } from '@/components/ui';
import { useA11y } from '@/lib/a11y';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

const TONE: Record<string, StatusTone> = { verified: 'success', under_review: 'info', pending: 'warning', rejected: 'danger', suspended: 'danger' };

export default function TherapistProfileTab() {
  const router = useRouter();
  const toast = useToast();
  const { profile, therapist, signOut } = useAuth();
  const { largeText, setLargeText } = useA11y();
  const update = useUpdateTherapistProfile();
  const status = therapist?.verification_status ?? 'pending';

  return (
    <Screen header={<BrandHeader />}>
      <Card style={{ marginTop: 12, alignItems: 'center', gap: 8 }}>
        <Avatar name={profile?.full_name ?? '?'} uri={therapist?.avatar_url} size={80} />
        <Text variant="title">{profile?.full_name}</Text>
        <Badge label={VERIFICATION_LABELS[status]} tone={TONE[status] ?? 'neutral'} icon={status === 'verified' ? 'shield-checkmark' : 'shield-outline'} />
        {therapist?.rating_count ? <Text color="textMuted">★ {Number(therapist.rating_avg).toFixed(1)} · {therapist.rating_count} reviews</Text> : <Text color="textMuted">No reviews yet</Text>}
      </Card>

      <Text variant="label" color="textMuted" style={{ marginTop: 24, marginBottom: 4 }}>PRACTICE</Text>
      <Card padding={4} style={{ paddingHorizontal: 16 }}>
        <Row icon="person-circle-outline" title="Edit profile" subtitle="Bio, qualifications, languages, photo" onPress={() => router.push('/edit-profile')} />
        <Row icon="medkit-outline" title="Services I offer" onPress={() => router.push('/my-services')} />
        <Row icon="time-outline" title="Working hours & time off" onPress={() => router.push('/availability')} />
        <Row icon="home-outline" title="Home-visit area" subtitle={therapist?.offers_home_visits ? `Up to ${therapist.service_radius_km} km` : 'Off'} onPress={() => router.push('/service-area')} />
        <Row icon="shield-checkmark-outline" title="Credentials & verification" onPress={() => router.push('/credentials')} last />
      </Card>

      <Card style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Accepting new bookings</Text>
            <Text variant="caption" color="textMuted">Turn off to stop appearing in search (existing bookings stay).</Text>
          </View>
          <Switch value={therapist?.is_accepting_bookings ?? true} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface}
            onValueChange={(v) => update.mutate({ is_accepting_bookings: v }, { onError: (e) => toast.show(friendlyError(e), 'error') })} accessibilityLabel="Accepting new bookings" />
        </View>
      </Card>

      <Text variant="label" color="textMuted" style={{ marginTop: 24, marginBottom: 4 }}>PREFERENCES</Text>
      <Card padding={4} style={{ paddingHorizontal: 16 }}>
        <Row icon="notifications-outline" title="Notifications" onPress={() => router.push('/notifications')} />
        <Row icon="text-outline" title="Larger text" right={<Switch value={largeText} onValueChange={setLargeText} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} accessibilityLabel="Larger text" />} last />
      </Card>

      <View style={{ marginTop: 28, gap: 12 }}>
        <Button label="Log out" variant="outline" icon="log-out-outline" onPress={signOut} />
        <Text variant="caption" color="textSubtle" align="center">BeVital · No One Left Behind</Text>
      </View>
    </Screen>
  );
}

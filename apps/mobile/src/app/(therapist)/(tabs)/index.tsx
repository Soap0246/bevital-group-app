import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { VERIFICATION_LABELS, formatTime, greetingFor, toKlDateString } from '@bevital/shared';
import { useTherapistBookings } from '@/api/therapist';
import { AppointmentCard } from '@/components/domain/cards';
import { BrandHeader } from '@/components/domain/TherapistHeader';
import { Badge, Banner, Button, Card, EmptyState, ErrorState, LoadingList, Screen, SectionHeader, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function TherapistToday() {
  const router = useRouter();
  const { profile, therapist } = useAuth();
  const bookings = useTherapistBookings();
  const today = toKlDateString();
  const all = bookings.data ?? [];
  const requests = all.filter((b) => b.status === 'awaiting_confirmation');
  const todays = all.filter((b) => toKlDateString(b.scheduled_start) === today && !['cancelled', 'awaiting_confirmation'].includes(b.status));
  const done = todays.filter((b) => b.status === 'completed').length;
  const next = todays.find((b) => !['completed'].includes(b.status) && new Date(b.scheduled_end) > new Date());
  const verified = therapist?.verification_status === 'verified';

  return (
    <Screen header={<BrandHeader />} refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()}>
      <Text variant="display" style={{ marginTop: 8 }}>{greetingFor()}, {(profile?.full_name ?? '').replace(/^Demo Physio\s*/i, '').split(' ')[0] || 'there'}</Text>
      <Text color="textMuted" style={{ marginBottom: 16 }}>Your schedule for today</Text>

      {!verified ? (
        <View style={{ gap: 10, marginBottom: 12 }}>
          <Banner tone={therapist?.verification_status === 'rejected' || therapist?.verification_status === 'suspended' ? 'danger' : 'warning'} icon="shield-outline" title={`Verification: ${VERIFICATION_LABELS[therapist?.verification_status ?? 'pending']}`}
            body="Patients can book you only after BeVital verifies your registration and certificates." />
          <Button label="Submit or review credentials" icon="document-attach-outline" variant="secondary" onPress={() => router.push('/credentials')} />
        </View>
      ) : null}

      {requests.length > 0 ? (
        <Card tone="tinted" onPress={() => router.push('/requests')} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View><Text variant="heading" color="primaryDark">{requests.length} booking request{requests.length > 1 ? 's' : ''}</Text><Text variant="caption" color="inkSoft">Accept or decline to confirm the patient's slot</Text></View>
            <Badge label="Review" tone="primary" />
          </View>
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={{ flex: 1, alignItems: 'center' }}><Text variant="display" color="primaryDark">{todays.length}</Text><Text variant="caption" color="textMuted">today</Text></Card>
        <Card style={{ flex: 1, alignItems: 'center' }}><Text variant="display" color="success">{done}</Text><Text variant="caption" color="textMuted">completed</Text></Card>
        <Card style={{ flex: 1, alignItems: 'center' }}><Text variant="display" color="warning">{requests.length}</Text><Text variant="caption" color="textMuted">requests</Text></Card>
      </View>

      {next ? <Banner tone="primary" icon="time-outline" title={`Next: ${formatTime(next.scheduled_start)}`} body={`${next.service?.name} · ${next.family?.full_name ?? next.patient?.full_name ?? 'Patient'}`} /> : null}

      <SectionHeader title="Today's schedule" />
      {bookings.isLoading ? <LoadingList /> : bookings.isError ? <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} /> : todays.length === 0 ? (
        <EmptyState icon="sunny-outline" title="No appointments today" body={verified ? 'Set your availability so patients can book you.' : 'Complete verification to start receiving bookings.'} actionLabel="Manage availability" onAction={() => router.push('/availability')} />
      ) : (
        <View style={{ gap: 12 }}>{todays.map((b) => <AppointmentCard key={b.id} booking={b} perspective="therapist" onPress={() => router.push({ pathname: '/visit/[id]', params: { id: b.id } })} />)}</View>
      )}
    </Screen>
  );
}

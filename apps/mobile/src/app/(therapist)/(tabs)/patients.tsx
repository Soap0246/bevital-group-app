import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDate } from '@bevital/shared';
import { groupPatients, useTherapistBookings } from '@/api/therapist';
import { BrandHeader } from '@/components/domain/TherapistHeader';
import { Avatar, Card, EmptyState, ErrorState, LoadingList, Screen, SearchBar, StatusBadge, Text } from '@/components/ui';

export default function TherapistPatients() {
  const router = useRouter();
  const bookings = useTherapistBookings();
  const [q, setQ] = useState('');
  const patients = useMemo(
    () => groupPatients((bookings.data ?? []).filter((b) => b.status !== 'cancelled')).filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())),
    [bookings.data, q],
  );
  return (
    <Screen header={<BrandHeader />} refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()}>
      <Text variant="title" style={{ marginTop: 8, marginBottom: 4 }}>My patients</Text>
      <Text color="textMuted" style={{ marginBottom: 12 }}>Only patients who have booked with you appear here.</Text>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search patients" />
      <View style={{ gap: 12, marginTop: 16 }}>
        {bookings.isLoading ? <LoadingList /> : bookings.isError ? <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} /> : patients.length === 0 ? (
          <EmptyState icon="people-outline" title="No patients yet" body="Patients appear after a booking is assigned to you." />
        ) : patients.map((p) => (
          <Card key={p.key} onPress={() => router.push({ pathname: '/client/[key]', params: { key: p.key } })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={p.name} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading">{p.name}</Text>
                <Text variant="caption" color="textMuted">{p.bookings.length} appointment{p.bookings.length > 1 ? 's' : ''} · last {formatDate(p.lastBooking.scheduled_start)}</Text>
              </View>
              <StatusBadge status={p.lastBooking.status} />
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

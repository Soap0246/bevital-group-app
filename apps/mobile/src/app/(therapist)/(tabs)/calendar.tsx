import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDate, toKlDateString } from '@bevital/shared';
import { useTherapistBookings } from '@/api/therapist';
import { DateStrip } from '@/components/domain/booking';
import { AppointmentCard } from '@/components/domain/cards';
import { BrandHeader } from '@/components/domain/TherapistHeader';
import { Button, EmptyState, ErrorState, LoadingList, Screen, Text } from '@/components/ui';

export default function TherapistCalendar() {
  const router = useRouter();
  const bookings = useTherapistBookings();
  const [date, setDate] = useState(toKlDateString());
  const day = (bookings.data ?? []).filter((b) => toKlDateString(b.scheduled_start) === date && b.status !== 'cancelled');
  const counts = new Map<string, number>();
  for (const b of bookings.data ?? []) if (b.status !== 'cancelled') counts.set(toKlDateString(b.scheduled_start), (counts.get(toKlDateString(b.scheduled_start)) ?? 0) + 1);

  return (
    <Screen header={<BrandHeader />} refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()}>
      <Text variant="title" style={{ marginTop: 8, marginBottom: 12 }}>Appointment calendar</Text>
      <DateStrip value={date} onChange={setDate} days={28} />
      <Text variant="subheading" style={{ marginTop: 16, marginBottom: 4 }}>{formatDate(`${date}T12:00:00+08:00`)}</Text>
      <Text variant="caption" color="textMuted" style={{ marginBottom: 12 }}>{counts.get(date) ?? 0} appointment{(counts.get(date) ?? 0) === 1 ? '' : 's'}</Text>
      <View style={{ gap: 12 }}>
        {bookings.isLoading ? <LoadingList /> : bookings.isError ? <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} /> : day.length === 0 ? (
          <EmptyState icon="calendar-outline" title="Nothing scheduled" body="No appointments on this day." />
        ) : day.map((b) => <AppointmentCard key={b.id} booking={b} perspective="therapist" onPress={() => router.push({ pathname: '/visit/[id]', params: { id: b.id } })} />)}
      </View>
      <Button label="Working hours & time off" variant="outline" icon="time-outline" style={{ marginTop: 20 }} onPress={() => router.push('/availability')} />
    </Screen>
  );
}

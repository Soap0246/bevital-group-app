import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMyBookings } from '@/api/bookings';
import { AppointmentCard } from '@/components/domain/cards';
import { EmptyState, ErrorState, LoadingList, Logo, Screen, Segmented, Text } from '@/components/ui';

export default function Bookings() {
  const router = useRouter();
  const bookings = useMyBookings();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const all = bookings.data ?? [];
  const isPast = (b: (typeof all)[number]) => ['completed', 'cancelled'].includes(b.status) || new Date(b.scheduled_end) < new Date();
  const list = all
    .filter((b) => (tab === 'past' ? isPast(b) : !isPast(b)))
    .sort((a, b) => (tab === 'past' ? +new Date(b.scheduled_start) - +new Date(a.scheduled_start) : +new Date(a.scheduled_start) - +new Date(b.scheduled_start)));

  return (
    <Screen header={<View style={{ paddingHorizontal: 20, paddingTop: 10 }}><Logo variant="nolb" height={40} /></View>} refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()}>
      <Text variant="title" style={{ marginTop: 12, marginBottom: 12 }}>My bookings</Text>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} />
      <View style={{ gap: 12, marginTop: 16 }}>
        {bookings.isLoading ? <LoadingList /> : bookings.isError ? <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} /> : list.length === 0 ? (
          <EmptyState icon="calendar-outline" title={tab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments yet'}
            body={tab === 'upcoming' ? 'When you book a session it will appear here with live status updates.' : 'Completed and cancelled appointments will appear here.'}
            actionLabel={tab === 'upcoming' ? 'Book a physiotherapist' : undefined} onAction={() => router.push('/book')} />
        ) : list.map((b) => <AppointmentCard key={b.id} booking={b} onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })} />)}
      </View>
    </Screen>
  );
}

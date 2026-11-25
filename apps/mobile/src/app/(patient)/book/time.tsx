import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDate, formatDuration, formatTime } from '@bevital/shared';
import { useAvailableTimes } from '@/api/catalog';
import { BookStep } from '@/components/domain/BookStep';
import { DateStrip, TimeGrid } from '@/components/domain/booking';
import { Banner, Button, EmptyState, ErrorState, LoadingList, Text } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';

/** Step 4 — date and time. Every slot shown comes from the server: real therapist schedules minus existing bookings. */
export default function SelectTime() {
  const router = useRouter();
  const { draft, update } = useBookingDraft();
  const { service, type } = draft;

  const query = useMemo(
    () => (service && type ? {
      serviceId: service.id, type, date: draft.date,
      clinicId: type === 'clinic' ? draft.clinicId : null,
      lat: type === 'home' ? draft.address?.latitude : null, lng: type === 'home' ? draft.address?.longitude : null,
    } : null),
    [service, type, draft.date, draft.clinicId, draft.address],
  );
  const slots = useAvailableTimes(query);
  if (!service || !type) { router.replace('/book'); return null; }

  return (
    <BookStep step={4} title="Pick a date and time" footer={
      <>
        {draft.startAt ? <Text variant="bodyStrong" align="center" color="primaryDark">{formatDate(draft.startAt)} · {formatTime(draft.startAt)}</Text> : null}
        <Button label="Continue" disabled={!draft.startAt} onPress={() => router.push('/book/therapist')} />
      </>
    }>
      <Text color="textMuted">{service.name} · {formatDuration(service.duration_minutes)}</Text>
      <DateStrip value={draft.date} onChange={(d) => update({ date: d })} />
      <Text variant="subheading" style={{ marginTop: 8 }}>Available times</Text>
      {slots.isLoading ? <LoadingList count={2} /> : slots.isError ? <ErrorState error={slots.error} onRetry={() => slots.refetch()} /> : (slots.data ?? []).length === 0 ? (
        <EmptyState icon="calendar-outline" title="No times available on this day" body={type === 'home' ? 'No verified physiotherapist covers this address on this date. Try another day.' : 'Try another day or clinic.'} />
      ) : (
        <View style={{ gap: 12 }}>
          <TimeGrid slots={slots.data ?? []} value={draft.startAt} onChange={(startAt) => update({ startAt })} />
          <Banner tone="info" icon="shield-checkmark-outline" title="Live availability" body="Times are calculated from verified physiotherapists' real working hours and existing bookings." />
        </View>
      )}
    </BookStep>
  );
}

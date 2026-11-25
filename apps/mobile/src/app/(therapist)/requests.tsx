import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { APPOINTMENT_TYPE_LABELS, formatDate, formatMYR, formatTime, friendlyError } from '@bevital/shared';
import { useRespondToBooking, useTherapistBookings, type TherapistBooking } from '@/api/therapist';
import { Button, Card, EmptyState, ErrorState, Icon, Input, LoadingList, Row, Screen, Sheet, Text, useToast } from '@/components/ui';

/** Booking requests awaiting this physiotherapist's accept / decline. */
export default function Requests() {
  const router = useRouter();
  const toast = useToast();
  const bookings = useTherapistBookings();
  const respond = useRespondToBooking();
  const [declining, setDeclining] = useState<TherapistBooking | null>(null);
  const [reason, setReason] = useState('');
  const list = (bookings.data ?? []).filter((b) => b.status === 'awaiting_confirmation');

  const act = async (b: TherapistBooking, accept: boolean, why?: string) => {
    try { await respond.mutateAsync({ bookingId: b.id, accept, reason: why }); toast.show(accept ? 'Booking accepted' : 'Booking declined'); setDeclining(null); setReason(''); }
    catch (e) { toast.show(friendlyError(e), 'error'); }
  };

  return (
    <Screen title="Booking requests" refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()}>
      <View style={{ gap: 12, marginTop: 8 }}>
        {bookings.isLoading ? <LoadingList /> : bookings.isError ? <ErrorState error={bookings.error} onRetry={() => bookings.refetch()} /> : list.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title="No pending requests" body="New booking requests appear here the moment a patient's payment is verified." />
        ) : list.map((b) => (
          <Card key={b.id}>
            <Text variant="subheading">{b.service?.name}</Text>
            <Row icon="person-outline" title={b.family?.full_name ?? b.patient?.full_name ?? 'Patient'} subtitle={b.family ? `Booked by ${b.patient?.full_name}` : undefined} />
            <Row icon="calendar-outline" title={formatDate(b.scheduled_start)} subtitle={`${formatTime(b.scheduled_start)} – ${formatTime(b.scheduled_end)}`} />
            <Row icon={b.appointment_type === 'home' ? 'home-outline' : 'business-outline'} title={APPOINTMENT_TYPE_LABELS[b.appointment_type]} subtitle={b.appointment_type === 'home' ? `${b.visit_address_text ?? ''}${b.travel_distance_km != null ? ` · ≈ ${Number(b.travel_distance_km).toFixed(1)} km` : ''}` : b.clinic?.name} />
            <Row icon="cash-outline" title={`You earn ≈ ${formatMYR(Math.round((Number(b.service_price) + Number(b.travel_fee)) * 0.8 * 100) / 100)}`} subtitle="Estimate before platform commission adjustments" last />
            {b.symptoms ? <Text variant="caption" color="inkSoft" style={{ marginVertical: 8 }}>Symptoms: {b.symptoms}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}><Button label="Decline" variant="danger" size="md" onPress={() => setDeclining(b)} /></View>
              <View style={{ flex: 1 }}><Button label="Accept" icon="checkmark" size="md" loading={respond.isPending} onPress={() => act(b, true)} /></View>
            </View>
            <Button label="View details" variant="ghost" size="md" onPress={() => router.push({ pathname: '/visit/[id]', params: { id: b.id } })} />
          </Card>
        ))}
      </View>

      <Sheet visible={!!declining} onClose={() => setDeclining(null)} title="Decline this booking?"
        footer={<Button label="Decline booking" variant="danger" loading={respond.isPending} onPress={() => declining && act(declining, false, reason)} />}>
        <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="information-circle-outline" size={20} color="info" /><Text style={{ flex: 1 }} color="textMuted">If this was an automatic match, BeVital offers it to the next available physiotherapist. Otherwise the patient is notified and refunded if they paid.</Text></View>
        <Input label="Reason (optional)" value={reason} onChangeText={setReason} multiline />
      </Sheet>
    </Screen>
  );
}

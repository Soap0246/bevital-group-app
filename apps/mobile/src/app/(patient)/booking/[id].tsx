import React, { useState } from 'react';
import { Linking, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { APPOINTMENT_TYPE_LABELS, BOOKING_STATUS_META, formatDate, formatDateTime, formatDistance, formatTime, friendlyError } from '@bevital/shared';
import {
  useBooking, useBookingHistory, useCancelBooking, useMyReview, usePaymentForBooking, useSetRecordSharing,
} from '@/api/bookings';
import { useLiveLocation } from '@/api/therapist';
import { PriceBreakdown, StatusTimeline } from '@/components/domain/booking';
import { TherapistCard } from '@/components/domain/cards';
import { TrackingMap } from '@/components/map/TrackingMap';
import { Banner, Button, Card, EmptyState, ErrorState, Input, LoadingList, Row, Screen, SectionHeader, Sheet, StatusBadge, Text, useToast } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { haversineKm } from '@/lib/geocoding';
import { colors } from '@/theme';

export default function BookingDetail() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useBooking(id);
  const history = useBookingHistory(id);
  const payment = usePaymentForBooking(id);
  const review = useMyReview(id);
  const cancel = useCancelBooking();
  const sharing = useSetRecordSharing();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const b = q.data;
  const onTheWay = b?.status === 'on_the_way' && b.appointment_type === 'home';
  const live = useLiveLocation(id, onTheWay);
  const hold = useCountdown(b?.status === 'pending' ? b.hold_expires_at : null);

  if (q.isLoading) return <Screen title="Booking"><LoadingList /></Screen>;
  if (q.isError) return <Screen title="Booking"><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!b) return <Screen title="Booking"><EmptyState icon="calendar-outline" title="Booking not found" /></Screen>;

  const meta = BOOKING_STATUS_META[b.status];
  const canCancel = ['pending', 'awaiting_confirmation', 'confirmed', 'therapist_assigned'].includes(b.status);
  const latestPayment = payment.data?.[0];
  const loc = live.data;
  const distance = loc && b.visit_latitude != null && b.visit_longitude != null ? haversineKm(loc.latitude, loc.longitude, Number(b.visit_latitude), Number(b.visit_longitude)) : null;

  const doCancel = async () => {
    try { await cancel.mutateAsync({ bookingId: b.id, reason }); setCancelOpen(false); toast.show('Appointment cancelled'); }
    catch (e) { toast.show(friendlyError(e), 'error'); }
  };

  return (
    <Screen title={b.reference} subtitle={b.service?.name} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 }}>
        <StatusBadge status={b.status} />
        <Text variant="caption" color="textMuted">{APPOINTMENT_TYPE_LABELS[b.appointment_type]}</Text>
      </View>
      <Text color="inkSoft">{meta.patientHint}</Text>

      {b.status === 'pending' ? (
        <Card tone="tinted" style={{ marginTop: 16 }}>
          <Text variant="bodyStrong">Payment needed to secure your slot</Text>
          {hold.seconds != null && !hold.expired ? <Text color="inkSoft">Held for {hold.label}</Text> : <Text color="danger">The hold has expired — this booking will be released.</Text>}
          <Button label="Pay now" icon="card" style={{ marginTop: 12 }} disabled={hold.expired} onPress={() => router.push({ pathname: '/book/payment', params: { bookingId: b.id } })} />
        </Card>
      ) : null}

      {onTheWay ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          <Text variant="heading">Your physiotherapist is on the way</Text>
          {loc && b.visit_latitude != null && b.visit_longitude != null ? (
            <>
              <TrackingMap destination={{ latitude: Number(b.visit_latitude), longitude: Number(b.visit_longitude) }} therapist={{ latitude: Number(loc.latitude), longitude: Number(loc.longitude) }} />
              <Text color="inkSoft">Approx. {formatDistance(distance)} away (straight line) · updated {formatTime(loc.recorded_at)}</Text>
            </>
          ) : (
            <Banner tone="info" icon="navigate-outline" title="Waiting for live location" body="The map appears as soon as your physiotherapist's phone shares its location. We never estimate or fake a position." />
          )}
        </View>
      ) : null}

      <SectionHeader title="Progress" />
      <Card><StatusTimeline status={b.status} type={b.appointment_type} history={history.data ?? []} /></Card>

      <SectionHeader title="Appointment" />
      <Card>
        <Row icon="calendar-outline" title={formatDate(b.scheduled_start)} subtitle={`${formatTime(b.scheduled_start)} – ${formatTime(b.scheduled_end)}`} />
        <Row
          icon={b.appointment_type === 'home' ? 'home-outline' : 'business-outline'}
          title={b.appointment_type === 'home' ? 'Home visit' : (b.clinic?.name ?? 'Clinic')}
          subtitle={b.appointment_type === 'home' ? (b.visit_address_text ?? undefined) : (b.clinic ? `${b.clinic.address_line1}, ${b.clinic.city}` : undefined)}
          onPress={b.appointment_type === 'clinic' && b.clinic?.latitude != null ? () => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${b.clinic!.latitude},${b.clinic!.longitude}`) : undefined}
        />
        {b.family ? <Row icon="people-outline" title={`For ${b.family.full_name}`} /> : null}
        <Row icon="document-text-outline" title="Symptoms / notes" subtitle={b.symptoms ?? b.patient_notes ?? 'None added'} last />
      </Card>

      {b.therapist ? (
        <>
          <SectionHeader title="Your physiotherapist" />
          <TherapistCard therapist={{ display_name: b.therapist.display_name, avatar_url: b.therapist.avatar_url, headline: null, years_experience: null, languages: [], rating_avg: 0, rating_count: 0 }} compact onPress={() => router.push({ pathname: '/therapist/[id]', params: { id: b.therapist!.id } })} />
        </>
      ) : null}

      <SectionHeader title="Price" />
      <Card>
        <PriceBreakdown quote={b} type={b.appointment_type} packageApplied={!!b.package_purchase_id} />
        {latestPayment ? (
          <Text variant="caption" color="textMuted" style={{ marginTop: 10 }}>
            Payment: {latestPayment.status}{latestPayment.receipt_number ? ` · Receipt ${latestPayment.receipt_number}` : ''}{latestPayment.refund_required ? ' · Refund under review' : ''}
          </Text>
        ) : null}
      </Card>

      {!['pending', 'cancelled'].includes(b.status) && b.status !== 'completed' ? (
        <Card style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Share health profile</Text>
              <Text variant="caption" color="textMuted">Your physiotherapist can read your medical history for this appointment.</Text>
            </View>
            <Switch value={b.share_records_consent} disabled={sharing.isPending} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface}
              onValueChange={(v) => sharing.mutate({ bookingId: b.id, share: v }, { onError: (e) => toast.show(friendlyError(e), 'error') })} accessibilityLabel="Share health profile with my physiotherapist" />
          </View>
        </Card>
      ) : null}

      {b.status === 'cancelled' && b.cancellation_reason ? <Banner tone="danger" icon="close-circle-outline" title="Cancelled" body={b.cancellation_reason} /> : null}

      <View style={{ gap: 12, marginTop: 20 }}>
        {b.status === 'completed' ? (
          <>
            <Button label="View my recovery plan" icon="pulse" onPress={() => router.push('/recovery')} />
            {b.therapist && !review.data ? <Button label="Rate your session" variant="secondary" icon="star-outline" onPress={() => router.push({ pathname: '/review/[bookingId]', params: { bookingId: b.id } })} /> : null}
            <Button label="Book again" variant="outline" onPress={() => router.push({ pathname: '/book', params: { serviceId: b.service_id } })} />
          </>
        ) : null}
        {canCancel ? <Button label="Cancel appointment" variant="danger" onPress={() => setCancelOpen(true)} /> : null}
      </View>
      <Text variant="caption" color="textSubtle" align="center" style={{ marginTop: 12 }}>Booked {formatDateTime(b.created_at)}</Text>

      <Sheet visible={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this appointment?" footer={<><Button label="Yes, cancel" variant="danger" loading={cancel.isPending} onPress={doCancel} /><Button label="Keep appointment" variant="ghost" onPress={() => setCancelOpen(false)} /></>}>
        <Text color="textMuted">Cancelling close to your appointment time may be charged under BeVital's cancellation policy. Any payment already made is reviewed for a refund.</Text>
        <Input label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Tell us why" multiline />
      </Sheet>
    </Screen>
  );
}

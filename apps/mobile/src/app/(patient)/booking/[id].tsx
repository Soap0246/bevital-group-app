import React, { useState } from 'react';
import { Linking, Pressable, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { APPOINTMENT_TYPE_LABELS, BOOKING_STATUS_META, formatDate, formatDateTime, formatDistance, formatTime, friendlyError, type BookingStatus } from '@bevital/shared';
import {
  useBooking, useBookingHistory, useCancelBooking, useMyReview, usePaymentForBooking, useSetRecordSharing,
} from '@/api/bookings';
import { useLiveLocation } from '@/api/therapist';
import { PriceBreakdown, StatusTimeline } from '@/components/domain/booking';
import { TrackingMap } from '@/components/map/TrackingMap';
import { Avatar, Badge, Banner, Button, EmptyState, ErrorState, Icon, Input, Row, Screen, Sheet, Skeleton, StatusBadge, Text, useToast, type IconName } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { haversineKm } from '@/lib/geocoding';
import { colors, radius } from '@/theme';

const card = { padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface } as const;

/** The four stages a patient cares about. Home visits include travel; clinic visits are check-in → session. */
function stagesFor(home: boolean): Array<{ label: string; match: BookingStatus[] }> {
  return home ? [
    { label: 'Confirmed', match: ['confirmed', 'therapist_assigned'] },
    { label: 'On the way', match: ['on_the_way'] },
    { label: 'Arrived', match: ['arrived', 'treatment_in_progress'] },
    { label: 'Done', match: ['completed'] },
  ] : [
    { label: 'Confirmed', match: ['confirmed', 'therapist_assigned'] },
    { label: 'Arrived', match: ['arrived'] },
    { label: 'In session', match: ['treatment_in_progress'] },
    { label: 'Done', match: ['completed'] },
  ];
}

function StatusStepper({ status, home }: { status: BookingStatus; home: boolean }) {
  const stages = stagesFor(home);
  const idx = status === 'completed' ? stages.length : stages.findIndex((s) => s.match.includes(status));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }} accessible accessibilityLabel={`Progress: ${idx < 0 ? 'awaiting confirmation' : idx >= stages.length ? 'done' : stages[idx].label}`}>
      {stages.map((s, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <View key={s.label} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
              <View style={{ flex: 1, height: 3, backgroundColor: i === 0 ? 'transparent' : i <= idx ? colors.primary : colors.border }} />
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done || current ? colors.primary : colors.surface, borderWidth: done || current ? 0 : 2, borderColor: colors.border }}>
                {done ? <Icon name="checkmark" size={14} color="surface" /> : current ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lime }} /> : null}
              </View>
              <View style={{ flex: 1, height: 3, backgroundColor: i === stages.length - 1 ? 'transparent' : i < idx ? colors.primary : colors.border }} />
            </View>
            <Text variant="label" color={done || current ? 'ink' : 'textSubtle'} align="center" numberOfLines={1}>{s.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

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
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [reason, setReason] = useState('');
  const b = q.data;
  const isHome = b?.appointment_type === 'home';
  const onTheWay = b?.status === 'on_the_way' && isHome;
  const live = useLiveLocation(id, onTheWay);
  const hold = useCountdown(b?.status === 'pending' ? b.hold_expires_at : null);

  if (q.isLoading) return <Screen title="Visit"><View style={{ gap: 12, marginTop: 8 }}><Skeleton height={120} rounded={20} /><Skeleton height={180} rounded={20} /></View></Screen>;
  if (q.isError) return <Screen title="Visit"><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!b) return <Screen title="Visit"><EmptyState icon="calendar-outline" title="Visit not found" /></Screen>;

  const meta = BOOKING_STATUS_META[b.status];
  const active = !['cancelled', 'completed'].includes(b.status);
  const canCancel = ['pending', 'awaiting_confirmation', 'confirmed', 'therapist_assigned'].includes(b.status);
  const latestPayment = payment.data?.[0];
  const payFailed = b.status === 'pending' && !!latestPayment && ['failed', 'cancelled'].includes(latestPayment.status);
  const loc = live.data;
  const distance = loc && b.visit_latitude != null && b.visit_longitude != null ? haversineKm(loc.latitude, loc.longitude, Number(b.visit_latitude), Number(b.visit_longitude)) : null;
  const destLat = isHome ? b.visit_latitude : b.clinic?.latitude;
  const destLng = isHome ? b.visit_longitude : b.clinic?.longitude;
  const directions = () => { if (destLat != null && destLng != null) void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`); };

  const doCancel = async () => {
    try { await cancel.mutateAsync({ bookingId: b.id, reason }); setCancelOpen(false); toast.show('Visit cancelled'); }
    catch (e) { toast.show(friendlyError(e), 'error'); }
  };
  const callPhysio = () => {
    const phone = !isHome ? b.clinic?.phone : null;
    if (phone) void Linking.openURL(`tel:${phone}`);
    else toast.show('Calling your physio will be available soon. For now, call the clinic or BeVital support.');
  };

  return (
    <Screen title={b.service?.name ?? 'Visit'} subtitle={b.reference} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ gap: 16, marginTop: 8 }}>
        {/* Status */}
        <View style={{ ...card, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StatusBadge status={b.status} />
            <Text variant="caption" color="textMuted">{APPOINTMENT_TYPE_LABELS[b.appointment_type]}</Text>
          </View>
          {b.status === 'cancelled' ? (
            <Banner tone="danger" icon="close-circle-outline" title="This visit was cancelled" body={b.cancellation_reason ?? undefined} />
          ) : (
            <>
              <StatusStepper status={b.status} home={!!isHome} />
              <Text variant="caption" color="inkSoft">{meta.patientHint}</Text>
            </>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="calendar-outline" size={16} color="textMuted" />
            <Text variant="bodyStrong">{formatDate(b.scheduled_start)} · {formatTime(b.scheduled_start)} – {formatTime(b.scheduled_end)}</Text>
          </View>
        </View>

        {/* Unpaid / failed payment */}
        {b.status === 'pending' ? (
          <View style={{ ...card, backgroundColor: colors.primaryLight, borderColor: colors.primaryLight, gap: 8 }}>
            <Text variant="subheading">{payFailed ? "Your last payment didn't go through" : 'Payment needed to secure your slot'}</Text>
            {hold.seconds != null && !hold.expired ? <Text variant="caption" color="inkSoft">Slot held for {hold.label}. Nothing is charged until payment succeeds.</Text> : <Text variant="caption" color="danger">The hold has expired. This visit will be released.</Text>}
            <Button label={payFailed ? 'Try again' : 'Pay now'} icon="card-outline" disabled={hold.expired} onPress={() => router.push({ pathname: '/book/payment', params: { bookingId: b.id } })} />
          </View>
        ) : null}

        {/* Map / ETA */}
        {active ? (
          onTheWay && loc && b.visit_latitude != null && b.visit_longitude != null ? (
            <View style={{ gap: 10 }}>
              <TrackingMap destination={{ latitude: Number(b.visit_latitude), longitude: Number(b.visit_longitude) }} therapist={{ latitude: Number(loc.latitude), longitude: Number(loc.longitude) }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="navigate-outline" size={16} color="primary" />
                <Text variant="bodyStrong">≈ {formatDistance(distance)} away</Text>
                <Text variant="caption" color="textMuted">updated {formatTime(loc.recorded_at)}</Text>
              </View>
            </View>
          ) : (
            <View style={{ ...card, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={isHome ? 'map-outline' : 'business-outline'} size={22} color="primary" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{isHome ? (onTheWay ? 'Waiting for live location' : 'Live map and ETA') : (b.clinic?.name ?? 'Clinic')}</Text>
                <Text variant="caption" color="textMuted">
                  {isHome ? (onTheWay ? "The map appears when your physio's phone shares its location. We never estimate a position." : 'Appears here when your physio is on the way.') : [b.clinic?.address_line1, b.clinic?.city].filter(Boolean).join(', ')}
                </Text>
              </View>
              </View>
              {!isHome && destLat != null ? <Button label="Directions" icon="navigate-outline" size="md" variant="outline" onPress={directions} /> : null}
            </View>
          )
        ) : null}

        {/* Physio */}
        {b.therapist ? (
          <View style={{ ...card, gap: 14 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${b.therapist.display_name}, view profile`} onPress={() => router.push({ pathname: '/therapist/[id]', params: { id: b.therapist!.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={b.therapist.display_name} uri={b.therapist.avatar_url} size={52} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="subheading">{b.therapist.display_name}</Text>
                <Badge label="Verified physiotherapist" tone="success" icon="shield-checkmark" />
              </View>
              <Icon name="chevron-forward" size={18} color="textSubtle" />
            </Pressable>
            {active ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Message" icon="chatbubble-outline" variant="outline" size="md" fullWidth={false} style={{ flex: 1 }} onPress={() => toast.show('In-app messaging is coming soon.')} />
                <Button label="Call" icon="call-outline" variant="outline" size="md" fullWidth={false} style={{ flex: 1 }} onPress={callPhysio} />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ ...card, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icon name="person-outline" size={22} color="primary" />
            <Text variant="caption" color="inkSoft" style={{ flex: 1 }}>Your physio is being assigned. You will be notified as soon as someone confirms.</Text>
          </View>
        )}

        {active ? (
          <Button label="Safety" icon="shield-outline" variant="outline" size="md" onPress={() => setSafetyOpen(true)} />
        ) : null}

        {/* Details */}
        <View style={card}>
          <Text variant="heading" style={{ marginBottom: 4 }}>Visit details</Text>
          <Row icon={isHome ? 'home-outline' : 'business-outline'} title={isHome ? 'Home visit' : (b.clinic?.name ?? 'Clinic')} subtitle={isHome ? (b.visit_address_text ?? undefined) : (b.clinic ? `${b.clinic.address_line1}, ${b.clinic.city}` : undefined)} />
          {b.family ? <Row icon="people-outline" title={`For ${b.family.full_name}`} /> : null}
          <Row icon="document-text-outline" title="Symptoms and notes" subtitle={b.symptoms ?? b.patient_notes ?? 'None added'} last />
        </View>

        <View style={{ ...card, gap: 12 }}>
          <Text variant="heading">Price</Text>
          <PriceBreakdown quote={b} type={b.appointment_type} packageApplied={!!b.package_purchase_id} />
          {latestPayment ? (
            <Text variant="caption" color="textMuted">
              Payment: {latestPayment.status.replace('_', ' ')}{latestPayment.receipt_number ? ` · Receipt ${latestPayment.receipt_number}` : ''}{latestPayment.refund_required ? ' · Refund under review' : ''}
            </Text>
          ) : null}
        </View>

        {!['pending', 'cancelled', 'completed'].includes(b.status) ? (
          <View style={{ ...card, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong">Share health profile</Text>
              <Text variant="caption" color="textMuted">Your physio can read your history for this visit.</Text>
            </View>
            <Switch value={b.share_records_consent} disabled={sharing.isPending} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface}
              onValueChange={(v) => sharing.mutate({ bookingId: b.id, share: v }, { onError: (e) => toast.show(friendlyError(e), 'error') })} accessibilityLabel="Share health profile with my physiotherapist" />
          </View>
        ) : null}

        <View style={{ ...card, gap: 8 }}>
          <Text variant="heading">Activity</Text>
          <StatusTimeline status={b.status} type={b.appointment_type} history={history.data ?? []} />
        </View>

        <View style={{ gap: 10 }}>
          {b.status === 'completed' ? (
            <>
              <Button label="View my recovery plan" icon="pulse-outline" onPress={() => router.push('/recovery')} />
              {b.therapist && !review.data ? <Button label="Rate your session" variant="secondary" icon="star-outline" onPress={() => router.push({ pathname: '/review/[bookingId]', params: { bookingId: b.id } })} /> : null}
              <Button label="Book again" variant="outline" onPress={() => router.push({ pathname: '/book', params: { serviceId: b.service_id, type: b.appointment_type } })} />
            </>
          ) : null}
          {canCancel && b.status !== 'pending' ? <Button label="Reschedule" icon="calendar-outline" variant="outline" onPress={() => setMoveOpen(true)} /> : null}
          {canCancel ? <Button label="Cancel visit" variant="danger" onPress={() => setCancelOpen(true)} /> : null}
        </View>
        <Text variant="caption" color="textSubtle" align="center">Booked {formatDateTime(b.created_at)}</Text>
      </View>

      <Sheet visible={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this visit?" footer={<><Button label="Yes, cancel" variant="danger" loading={cancel.isPending} onPress={doCancel} /><Button label="Keep visit" variant="ghost" onPress={() => setCancelOpen(false)} /></>}>
        <Text color="textMuted">Cancelling close to your visit may be charged under BeVital's cancellation policy. Any payment already made is reviewed for a refund.</Text>
        <Input label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Tell us why" multiline />
      </Sheet>

      <Sheet visible={moveOpen} onClose={() => setMoveOpen(false)} title="Change the time"
        footer={<><Button label="Pick a new time" icon="calendar-outline" onPress={() => { setMoveOpen(false); router.push({ pathname: '/book', params: { serviceId: b.service_id, type: b.appointment_type, therapistId: b.therapist?.id } }); }} /><Button label="Not now" variant="ghost" onPress={() => setMoveOpen(false)} /></>}>
        <Text color="textMuted">Book the new time first, then cancel this visit so you never lose your place. Cancelling inside the free-cancellation window costs nothing.</Text>
      </Sheet>

      <Sheet visible={safetyOpen} onClose={() => setSafetyOpen(false)} title="Your safety"
        footer={<><Button label="Call emergency services (999)" icon="call" variant="danger" onPress={() => void Linking.openURL('tel:999')} /><Button label="Close" variant="ghost" onPress={() => setSafetyOpen(false)} /></>}>
        {([
          ['shield-checkmark-outline', 'Only your assigned, verified physiotherapist should arrive. Check the name above matches.'],
          ['people-outline', 'You are welcome to have a family member or friend present during the visit.'],
          ['alert-circle-outline', 'If you ever feel unsafe, end the visit and call emergency services.'],
        ] as Array<[IconName, string]>).map(([icon, text]) => (
          <View key={text} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name={icon} size={18} color="primary" />
            <Text variant="caption" color="inkSoft" style={{ flex: 1 }}>{text}</Text>
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { APPOINTMENT_TYPE_LABELS, BOOKING_STATUS_META, formatDate, formatMYR, formatTime } from '@bevital/shared';
import { useBooking } from '@/api/bookings';
import { Banner, Button, Card, Icon, LoadingList, Row, Screen, StatusBadge, Text } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { colors } from '@/theme';

/** Step 10 — confirmation. Reflects the booking's REAL status; a pending (unpaid) booking is never shown as success. */
export default function Confirmation() {
  const router = useRouter();
  const { draft, reset } = useBookingDraft();
  const { bookingId: paramId } = useLocalSearchParams<{ bookingId?: string }>();
  const { data: b, isLoading } = useBooking(paramId ?? draft.bookingId ?? undefined);

  if (isLoading || !b) return <Screen><LoadingList count={2} /></Screen>;
  const paid = b.status !== 'pending' && b.status !== 'cancelled';
  const done = () => { reset(); router.dismissAll(); router.replace('/(patient)/(tabs)'); };

  return (
    <Screen footer={
      <>
        <Button label="View booking" onPress={() => { const id = b.id; reset(); router.dismissAll(); router.push({ pathname: '/booking/[id]', params: { id } }); }} />
        <Button label="Back to home" variant="ghost" onPress={done} />
      </>
    }>
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 28, paddingBottom: 12 }}>
        <Animated.View entering={ZoomIn.springify()} style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: paid ? colors.successLight : colors.warningLight, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={paid ? 'checkmark-circle' : 'time'} size={72} color={paid ? 'success' : 'warning'} />
        </Animated.View>
        <Text variant="title" align="center">{paid ? 'Booking received!' : b.status === 'cancelled' ? 'Booking cancelled' : 'Waiting for payment'}</Text>
        <Text color="textMuted" align="center">
          {paid ? BOOKING_STATUS_META[b.status].patientHint : b.status === 'cancelled' ? 'This slot was released.' : 'Your booking is held until payment is verified by our payment partner.'}
        </Text>
        <StatusBadge status={b.status} />
      </View>

      {b.status === 'awaiting_confirmation' ? <Banner tone="info" icon="notifications-outline" title="What happens next" body="Your physiotherapist reviews the request and you'll get a notification the moment it is confirmed." /> : null}

      <Card style={{ marginTop: 16 }}>
        <Text variant="label" color="textMuted">BOOKING REFERENCE</Text>
        <Text variant="title" color="primaryDark" style={{ marginBottom: 8 }}>{b.reference}</Text>
        <Row icon="medkit-outline" title={b.service?.name ?? 'Physiotherapy'} subtitle={APPOINTMENT_TYPE_LABELS[b.appointment_type]} />
        <Row icon="calendar-outline" title={formatDate(b.scheduled_start)} subtitle={`${formatTime(b.scheduled_start)} – ${formatTime(b.scheduled_end)}`} />
        <Row icon="person-outline" title={b.therapist?.display_name ?? 'Physiotherapist being assigned'} />
        <Row icon="cash-outline" title={formatMYR(b.total_amount)} subtitle={Number(b.total_amount) === 0 ? 'Covered by your package' : paid ? 'Payment verified' : 'Payment pending'} last />
      </Card>
    </Screen>
  );
}

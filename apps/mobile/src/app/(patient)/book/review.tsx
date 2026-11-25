import React, { useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { APPOINTMENT_TYPE_LABELS, formatDate, formatDistance, formatDuration, formatMYR, formatTime, friendlyError } from '@bevital/shared';
import { useCreateBooking, useQuote } from '@/api/bookings';
import { usePublicSettings, useTherapist } from '@/api/catalog';
import { useMyPackages } from '@/api/profile';
import { BookStep } from '@/components/domain/BookStep';
import { PriceBreakdown } from '@/components/domain/booking';
import { Banner, Button, Card, Icon, Input, LoadingList, Row, Text, useToast } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { colors } from '@/theme';

/** Steps 6–7 — price breakdown, promo/package, consent, then create the booking (server re-prices it). */
export default function ReviewBooking() {
  const router = useRouter();
  const toast = useToast();
  const { draft, update } = useBookingDraft();
  const settings = usePublicSettings();
  const packages = useMyPackages();
  const create = useCreateBooking();
  const [promoInput, setPromoInput] = useState(draft.promoCode);
  const { service, type, startAt } = draft;

  const quoteInput = useMemo(
    () => (service && type && startAt ? {
      serviceId: service.id, type, startAt,
      clinicId: type === 'clinic' ? draft.clinicId : null,
      lat: type === 'home' ? draft.address?.latitude : null, lng: type === 'home' ? draft.address?.longitude : null,
      therapistId: draft.therapist?.id ?? null, promoCode: draft.promoCode || null, packagePurchaseId: draft.packagePurchaseId,
    } : null),
    [service, type, startAt, draft.clinicId, draft.address, draft.therapist, draft.promoCode, draft.packagePurchaseId],
  );
  const quote = useQuote(quoteInput);
  const matched = useTherapist(quote.data?.therapist_id);

  const usablePackages = (packages.data ?? []).filter((p) =>
    p.status === 'active' && p.sessions_remaining > 0 && p.expires_at && new Date(p.expires_at) > new Date() && (!p.package?.service_id || p.package.service_id === service?.id));

  if (!service || !type || !startAt) { router.replace('/book'); return null; }
  const freeHours = Number(settings.data?.free_cancellation_hours ?? 24);

  const confirm = async () => {
    if (!quote.data) return;
    try {
      const booking = await create.mutateAsync({
        serviceId: service.id, type, startAt, clinicId: draft.clinicId, addressId: draft.address?.id ?? null,
        therapistId: draft.therapist?.id ?? null, familyMemberId: draft.familyMemberId, promoCode: draft.promoCode || null,
        packagePurchaseId: draft.packagePurchaseId, notes: draft.notes, symptoms: draft.symptoms,
        shareRecords: draft.shareRecords, expectedTotal: Number(quote.data.total_amount),
      });
      update({ bookingId: booking.id });
      router.replace(Number(booking.total_amount) > 0 ? '/book/payment' : '/book/confirmation');
    } catch (e) {
      const msg = friendlyError(e);
      toast.show(msg, 'error');
      if (/BV_PRICE_CHANGED/.test((e as Error).message)) void quote.refetch();
      if (/BV_SLOT_UNAVAILABLE|BV_PATIENT_OVERLAP/.test((e as Error).message)) router.replace('/book/time');
    }
  };

  return (
    <BookStep step={6} title="Review & confirm" footer={
      <Button
        label={quote.data && Number(quote.data.total_amount) === 0 ? 'Confirm booking' : 'Confirm & continue to payment'}
        iconRight="arrow-forward"
        loading={create.isPending}
        disabled={!quote.data}
        onPress={confirm}
      />
    }>
      <Card>
        <View style={{ gap: 10 }}>
          <Text variant="heading">{service.name}</Text>
          <Row icon="calendar-outline" title={`${formatDate(startAt)}`} subtitle={`${formatTime(startAt)} · ${formatDuration(service.duration_minutes)}`} />
          <Row icon={type === 'home' ? 'home-outline' : 'business-outline'} title={APPOINTMENT_TYPE_LABELS[type]} subtitle={type === 'home' ? [draft.address?.line1, draft.address?.city].filter(Boolean).join(', ') : draft.clinicName ?? undefined} />
          <Row
            icon="person-outline"
            title={draft.therapist ? draft.therapist.name : 'Automatic matching'}
            subtitle={draft.therapist ? 'Your chosen physiotherapist' : matched.data ? `Best match right now: ${matched.data.profile.display_name}` : 'Best available physiotherapist'}
            last={!draft.familyMemberId}
          />
          {draft.familyMemberId ? <Row icon="people-outline" title={`For ${draft.familyMemberName}`} subtitle="Booked on their behalf" last /> : null}
        </View>
      </Card>

      {usablePackages.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text variant="subheading">Use a package session</Text>
          {usablePackages.map((p) => {
            const on = draft.packagePurchaseId === p.id;
            return (
              <Card key={p.id} onPress={() => update({ packagePurchaseId: on ? null : p.id, promoCode: '' })} style={on ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Icon name="ticket-outline" size={24} color="primary" />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{p.package?.name ?? 'Package'}</Text>
                    <Text variant="caption" color="textMuted">{p.sessions_remaining} of {p.sessions_total} sessions left</Text>
                  </View>
                  {on ? <Icon name="checkmark-circle" size={24} color="primary" /> : null}
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}

      {!draft.packagePurchaseId ? (
        <View style={{ gap: 8 }}>
          <Text variant="subheading">Promo code</Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Input value={promoInput} onChangeText={(t) => setPromoInput(t.toUpperCase())} autoCapitalize="characters" placeholder="Enter code" icon="pricetag-outline" /></View>
            <Button label="Apply" variant="secondary" fullWidth={false} size="md" onPress={() => update({ promoCode: promoInput.trim() })} style={{ marginTop: 2 }} />
          </View>
          {quote.data?.promo_error && draft.promoCode ? <Text variant="caption" color="danger">{quote.data.promo_error}</Text> : null}
          {quote.data && Number(quote.data.discount_amount) > 0 && draft.promoCode ? <Text variant="caption" color="success">Code applied: you save {formatMYR(quote.data.discount_amount)}</Text> : null}
        </View>
      ) : null}

      <Card>
        <Text variant="heading" style={{ marginBottom: 12 }}>Price</Text>
        {quote.isLoading ? <LoadingList count={1} /> : quote.isError ? (
          <Banner tone="danger" icon="alert-circle" title="Couldn't price this booking" body={friendlyError(quote.error)} />
        ) : quote.data ? (
          <>
            <PriceBreakdown quote={quote.data} type={type} packageApplied={!!quote.data.package_purchase_id} />
            {type === 'home' && quote.data.travel_distance_km != null ? (
              <Text variant="caption" color="textSubtle" style={{ marginTop: 10 }}>Travel fee uses an estimated road distance of {formatDistance(Number(quote.data.travel_distance_km))} from your physiotherapist's base.</Text>
            ) : null}
          </>
        ) : null}
      </Card>

      <Input label="Describe your symptoms (optional)" multiline value={draft.symptoms} onChangeText={(t) => update({ symptoms: t })} placeholder="e.g. lower back pain for 3 weeks, worse when sitting" />
      <Input label="Notes for your physiotherapist (optional)" multiline value={draft.notes} onChangeText={(t) => update({ notes: t })} placeholder="Anything we should know — access instructions, preferences…" />

      <Card tone="tinted">
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <Switch value={draft.shareRecords} onValueChange={(v) => update({ shareRecords: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} accessibilityLabel="Share my health profile with my physiotherapist" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="bodyStrong">Share my health profile</Text>
            <Text variant="caption" color="inkSoft">Lets your physiotherapist for this appointment read your medical history, conditions and allergies. Every access is logged. You can withdraw this any time from the booking page.</Text>
          </View>
        </View>
      </Card>

      <Pressable onPress={() => undefined}>
        <Text variant="caption" color="textMuted">Free cancellation up to {freeHours} hours before your appointment. Later cancellations may be charged according to BeVital's policy.</Text>
      </Pressable>
    </BookStep>
  );
}

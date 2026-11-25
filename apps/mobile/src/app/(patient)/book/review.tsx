import React, { useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import { APPOINTMENT_TYPE_LABELS, formatDate, formatDistance, formatDuration, formatMYR, formatTime, friendlyError, type PaymentMethod } from '@bevital/shared';
import { useCreateBooking, useQuote } from '@/api/bookings';
import { usePublicSettings, useTherapist } from '@/api/catalog';
import { useMyPackages } from '@/api/profile';
import { BookStep } from '@/components/domain/BookStep';
import { PriceBreakdown } from '@/components/domain/booking';
import { Banner, Chip, ChipRow, Icon, Input, Skeleton, Text, useToast, type IconName } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { colors, radius } from '@/theme';

const METHODS: Array<{ id: PaymentMethod; label: string; icon: IconName }> = [
  { id: 'fpx', label: 'FPX', icon: 'business-outline' },
  { id: 'duitnow_qr', label: 'DuitNow QR', icon: 'qr-code-outline' },
  { id: 'credit_card', label: 'Card', icon: 'card-outline' },
];

function SummaryRow({ icon, label, title, subtitle, onEdit, last }: { icon: IconName; label: string; title: string; subtitle?: string; onEdit: () => void; last?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color="primary" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" color="textMuted">{label.toUpperCase()}</Text>
        <Text variant="bodyStrong" numberOfLines={2}>{title}</Text>
        {subtitle ? <Text variant="caption" color="textMuted" numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${label}`} onPress={onEdit} hitSlop={6} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="bodyStrong" color="primary">Edit</Text>
      </Pressable>
    </View>
  );
}

/** Step 4 — summary with Edit links, price, consent and payment method; "Pay" creates the booking (server re-prices it) and opens checkout. */
export default function ReviewAndPay() {
  const router = useRouter();
  const toast = useToast();
  const { draft, update } = useBookingDraft();
  const settings = usePublicSettings();
  const packages = useMyPackages();
  const create = useCreateBooking();
  const [promoOpen, setPromoOpen] = useState(!!draft.promoCode);
  const [promoInput, setPromoInput] = useState(draft.promoCode);
  const [notesOpen, setNotesOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('fpx');
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
  const total = quote.data ? Number(quote.data.total_amount) : null;
  const free = total === 0;

  const pay = async () => {
    if (!quote.data) return;
    try {
      const booking = await create.mutateAsync({
        serviceId: service.id, type, startAt, clinicId: draft.clinicId, addressId: draft.address?.id ?? null,
        therapistId: draft.therapist?.id ?? null, familyMemberId: draft.familyMemberId, promoCode: draft.promoCode || null,
        packagePurchaseId: draft.packagePurchaseId, notes: draft.notes, symptoms: draft.symptoms,
        shareRecords: draft.shareRecords, expectedTotal: Number(quote.data.total_amount),
      });
      update({ bookingId: booking.id });
      if (Number(booking.total_amount) > 0) router.replace({ pathname: '/book/payment', params: { bookingId: booking.id, method, auto: '1' } });
      else router.replace('/book/confirmation');
    } catch (e) {
      toast.show(friendlyError(e), 'error');
      if (/BV_PRICE_CHANGED/.test((e as Error).message)) void quote.refetch();
      if (/BV_SLOT_UNAVAILABLE|BV_PATIENT_OVERLAP/.test((e as Error).message)) router.replace('/book/time');
    }
  };

  const physio = draft.therapist ? draft.therapist.name : matched.data ? `${matched.data.profile.display_name}` : 'Best available physio';
  const physioSub = draft.therapist ? 'Your choice' : 'Matched automatically';

  return (
    <BookStep step={4} title="Review and pay" price={total} priceLabel="Total" cta={free ? 'Confirm booking' : total != null ? `Pay ${formatMYR(total)}` : 'Pay'}
      onNext={pay} nextDisabled={!quote.data} loading={create.isPending}
      note={free ? undefined : 'Your slot is held while you complete payment.'}>
      <View style={{ paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <SummaryRow icon="medkit-outline" label={draft.familyMemberId ? `For ${draft.familyMemberName}` : 'Service'} title={service.name} subtitle={`${APPOINTMENT_TYPE_LABELS[type]} · ${formatDuration(service.duration_minutes)}`} onEdit={() => router.push('/book')} />
        <SummaryRow icon="calendar-outline" label="When" title={`${formatDate(startAt)}, ${formatTime(startAt)}`}
          subtitle={type === 'home' ? [draft.address?.line1, draft.address?.city].filter(Boolean).join(', ') : draft.clinicName ?? undefined} onEdit={() => router.push('/book/time')} />
        <SummaryRow icon="person-outline" label="Your physio" title={physio} subtitle={physioSub} onEdit={() => router.push('/book/therapist')} last />
      </View>

      {usablePackages.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text variant="subheading">Use a package session</Text>
          {usablePackages.map((p) => {
            const on = draft.packagePurchaseId === p.id;
            return (
              <Pressable key={p.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => update({ packagePurchaseId: on ? null : p.id, promoCode: '' })}
                style={{ minHeight: 56, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border, backgroundColor: colors.surface }}>
                <Icon name="ticket-outline" size={22} color="primary" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{p.package?.name ?? 'Package'}</Text>
                  <Text variant="caption" color="textMuted">{p.sessions_remaining} of {p.sessions_total} sessions left</Text>
                </View>
                {on ? <Icon name="checkmark-circle" size={22} color="primary" /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ padding: 16, gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <Text variant="heading">Price</Text>
        {quote.isLoading ? <View style={{ gap: 10 }}><Skeleton height={20} /><Skeleton height={20} /><Skeleton height={24} /></View> : quote.isError ? (
          <Banner tone="danger" icon="alert-circle" title="Couldn't price this booking" body={friendlyError(quote.error)} />
        ) : quote.data ? (
          <>
            <PriceBreakdown quote={quote.data} type={type} packageApplied={!!quote.data.package_purchase_id} />
            {type === 'home' && quote.data.travel_distance_km != null ? (
              <Text variant="caption" color="textSubtle">Travel fee uses an estimated road distance of {formatDistance(Number(quote.data.travel_distance_km))}.</Text>
            ) : null}
          </>
        ) : null}
        {!draft.packagePurchaseId ? (
          promoOpen ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}><Input value={promoInput} onChangeText={(t) => setPromoInput(t.toUpperCase())} autoCapitalize="characters" placeholder="Promo code" icon="pricetag-outline" /></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Apply promo code" onPress={() => update({ promoCode: promoInput.trim() })} style={{ minHeight: 52, paddingHorizontal: 8, justifyContent: 'center' }}>
                  <Text variant="bodyStrong" color="primary">Apply</Text>
                </Pressable>
              </View>
              {quote.data?.promo_error && draft.promoCode ? <Text variant="caption" color="danger">{quote.data.promo_error}</Text> : null}
              {quote.data && Number(quote.data.discount_amount) > 0 && draft.promoCode ? <Text variant="caption" color="success">Code applied. You save {formatMYR(quote.data.discount_amount)}.</Text> : null}
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setPromoOpen(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text variant="bodyStrong" color="primary">Have a promo code?</Text>
            </Pressable>
          )
        ) : null}
      </View>

      <View style={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">Share my health profile</Text>
          <Text variant="caption" color="textMuted">Lets your physio read your history for this visit. Every access is logged and you can turn it off any time.</Text>
        </View>
        <Switch value={draft.shareRecords} onValueChange={(v) => update({ shareRecords: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} accessibilityLabel="Share my health profile with my physiotherapist" />
      </View>

      {!free ? (
        <View style={{ gap: 10 }}>
          <Text variant="subheading">Pay with</Text>
          <ChipRow>
            {METHODS.map((m) => <Chip key={m.id} label={m.label} icon={m.icon} selected={method === m.id} onPress={() => setMethod(m.id)} />)}
          </ChipRow>
        </View>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => setNotesOpen((v) => !v)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={notesOpen ? 'chevron-down' : 'chevron-forward'} size={18} color="primary" />
        <Text variant="bodyStrong" color="primary">Add notes for your physio (optional)</Text>
      </Pressable>
      {notesOpen ? (
        <View style={{ gap: 12 }}>
          <Input label="Symptoms" multiline value={draft.symptoms} onChangeText={(t) => update({ symptoms: t })} placeholder="e.g. lower back pain for 3 weeks, worse when sitting" />
          <Input label="Notes" multiline value={draft.notes} onChangeText={(t) => update({ notes: t })} placeholder="Access instructions, preferences…" />
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <Icon name="shield-checkmark-outline" size={16} color="success" />
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>Free cancellation up to {freeHours} hours before your visit. Later cancellations may be charged under BeVital's policy.</Text>
      </View>
    </BookStep>
  );
}

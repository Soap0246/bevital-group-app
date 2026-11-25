import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addDaysToDateString, formatDate, formatDuration, formatTime, toKlDateString } from '@bevital/shared';
import { useAvailabilityCalendar, useAvailableTimes, useClinics } from '@/api/catalog';
import { useAddresses } from '@/api/profile';
import { BookStep } from '@/components/domain/BookStep';
import { DateStrip, TimeGrid } from '@/components/domain/booking';
import { Button, EmptyState, ErrorState, Icon, Sheet, Skeleton, Text } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { useRunningPrice } from '@/lib/useBookingPrice';
import { colors, radius } from '@/theme';

const DAYS = 14;

/** Step 2 — where (home address / clinic) and when. Every slot is computed by the server from real schedules. */
export default function WhenAndWhere() {
  const router = useRouter();
  const { draft, update } = useBookingDraft();
  const { service, type } = draft;
  const addresses = useAddresses();
  const clinics = useClinics();
  const [pick, setPick] = useState(false);
  const userPicked = useRef(false);
  const price = useRunningPrice(draft);

  // Pre-fill the location so the common case needs no taps.
  useEffect(() => {
    if (type === 'home' && !draft.address && addresses.data?.length) update({ address: addresses.data[0] });
    if (type === 'clinic' && !draft.clinicId && clinics.data?.length) update({ clinicId: clinics.data[0].id, clinicName: clinics.data[0].name });
  }, [type, draft.address, draft.clinicId, addresses.data, clinics.data, update]);

  const ready = type === 'home' ? !!draft.address : !!draft.clinicId;
  const base = useMemo(
    () => (service && type && ready ? {
      serviceId: service.id, type,
      clinicId: type === 'clinic' ? draft.clinicId : null,
      lat: type === 'home' ? draft.address?.latitude : null, lng: type === 'home' ? draft.address?.longitude : null,
    } : null),
    [service, type, ready, draft.clinicId, draft.address],
  );
  const dates = useMemo(() => { const t = toKlDateString(); return Array.from({ length: DAYS }, (_, i) => addDaysToDateString(t, i)); }, []);
  const calendar = useAvailabilityCalendar(base, dates);
  const sig = calendar.map((d) => (d.loading ? 'l' : d.failed ? 'x' : d.count)).join(',');
  const soldOut = useMemo(() => new Set(calendar.filter((d) => !d.loading && !d.failed && d.count === 0).map((d) => d.date)), [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open on the earliest day that has times (unless the person already picked a day).
  useEffect(() => {
    if (!base || userPicked.current || draft.startAt) return;
    for (const d of calendar) {
      if (d.loading) return;
      if (d.count > 0) { if (d.date !== draft.date) update({ date: d.date }); return; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, base]);

  const slots = useAvailableTimes(base ? { ...base, date: draft.date } : null);
  if (!service || !type) { router.replace('/book'); return null; }

  const allFull = base && calendar.every((d) => !d.loading && !d.failed && d.count === 0);
  const clinic = (clinics.data ?? []).find((c) => c.id === draft.clinicId);
  const where = type === 'home'
    ? { label: 'Visit address', text: draft.address ? [draft.address.line1, draft.address.city].filter(Boolean).join(', ') : 'Add where you want to be treated', icon: 'home-outline' as const }
    : { label: 'Clinic', text: clinic ? `${clinic.name}, ${clinic.city}` : 'Choose a clinic', icon: 'business-outline' as const };

  return (
    <BookStep
      step={2}
      title="When and where?"
      price={price.amount}
      priceLabel={price.exact ? 'Total' : 'Service fee'}
      onNext={() => router.push('/book/therapist')}
      nextDisabled={!draft.startAt}
      note={draft.startAt ? `${formatDate(draft.startAt)} · ${formatTime(draft.startAt)} · ${formatDuration(service.duration_minutes)}` : undefined}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={`${where.label}: ${where.text}. Change`} onPress={() => setPick(true)}
        style={{ minHeight: 64, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={where.icon} size={20} color="primary" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" color="textMuted">{where.label.toUpperCase()}</Text>
          <Text variant="bodyStrong" numberOfLines={2}>{where.text}</Text>
        </View>
        <Text variant="bodyStrong" color="primary">{ready ? 'Change' : 'Add'}</Text>
      </Pressable>

      <View style={{ gap: 10 }}>
        <Text variant="subheading">Date</Text>
        {!ready ? (
          <Skeleton height={76} rounded={14} />
        ) : (
          <DateStrip value={draft.date} soldOut={soldOut} days={DAYS} onChange={(d) => { userPicked.current = true; update({ date: d }); }} />
        )}
      </View>

      <View style={{ gap: 12 }}>
        <Text variant="subheading">Time</Text>
        {!ready ? (
          <EmptyState icon={type === 'home' ? 'location-outline' : 'business-outline'} title={type === 'home' ? 'Add your address first' : 'Choose a clinic first'} body="We need to know where, so we only show physiotherapists who can reach you." actionLabel={type === 'home' ? 'Add address' : 'Choose clinic'} onAction={() => (type === 'home' ? router.push('/address/edit') : setPick(true))} />
        ) : allFull ? (
          <EmptyState icon="calendar-outline" title="No times in the next two weeks" body={type === 'home' ? 'No verified physiotherapist covers this address yet. Try a clinic visit or a different address.' : 'Try another clinic or check back soon.'} />
        ) : slots.isLoading ? (
          <View style={{ gap: 8 }}><Skeleton height={44} rounded={12} /><Skeleton height={44} rounded={12} /></View>
        ) : slots.isError ? <ErrorState error={slots.error} onRetry={() => slots.refetch()} /> : (slots.data ?? []).length === 0 ? (
          <EmptyState icon="calendar-outline" title="Fully booked this day" body="Pick another date. Days that are full are greyed out." />
        ) : (
          <TimeGrid slots={slots.data ?? []} value={draft.startAt} onChange={(startAt) => update({ startAt })} />
        )}
      </View>

      <Sheet visible={pick} onClose={() => setPick(false)} title={type === 'home' ? 'Where should we visit?' : 'Choose a clinic'}
        footer={type === 'home' ? <Button label="Add a new address" icon="add" variant="secondary" onPress={() => { setPick(false); router.push('/address/edit'); }} /> : undefined}>
        {type === 'home' ? (
          (addresses.data ?? []).length === 0 ? <Text color="textMuted">You have no saved addresses yet.</Text> : (addresses.data ?? []).map((a) => {
            const on = draft.address?.id === a.id;
            return (
              <Pressable key={a.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { update({ address: a }); setPick(false); }}
                style={{ minHeight: 56, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name={a.label.toLowerCase() === 'work' ? 'briefcase-outline' : 'home-outline'} size={22} color="primary" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{a.label}{a.is_default ? ' · Default' : ''}</Text>
                  <Text variant="caption" color="textMuted">{[a.line1, a.line2, `${a.postcode} ${a.city}`].filter(Boolean).join(', ')}</Text>
                </View>
                {on ? <Icon name="checkmark-circle" size={22} color="primary" /> : null}
              </Pressable>
            );
          })
        ) : (
          (clinics.data ?? []).map((c) => {
            const on = draft.clinicId === c.id;
            return (
              <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { update({ clinicId: c.id, clinicName: c.name }); setPick(false); }}
                style={{ minHeight: 56, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="business-outline" size={22} color="primary" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{c.name}</Text>
                  <Text variant="caption" color="textMuted">{[c.address_line1, `${c.postcode} ${c.city}`].join(', ')}</Text>
                </View>
                {on ? <Icon name="checkmark-circle" size={22} color="primary" /> : null}
              </Pressable>
            );
          })
        )}
      </Sheet>
    </BookStep>
  );
}

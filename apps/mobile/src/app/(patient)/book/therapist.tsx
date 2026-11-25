import React, { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistance, formatDuration, formatMYR, type AvailableTherapist } from '@bevital/shared';
import { useAvailableTherapists, useTherapistStats } from '@/api/catalog';
import { BookStep } from '@/components/domain/BookStep';
import { Avatar, Badge, EmptyState, ErrorState, Icon, Rating, Skeleton, Text } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { useRunningPrice } from '@/lib/useBookingPrice';
import { colors, radius } from '@/theme';

function PhysioChoice({ t, selected, onPress, stats }: { t: AvailableTherapist; selected: boolean; onPress: () => void; stats?: { registration: string | null; sessions: number } }) {
  const total = Number(t.service_price) + Number(t.travel_fee);
  const facts: string[] = [];
  if (t.years_experience) facts.push(`${t.years_experience} yrs experience`);
  if (stats && stats.sessions > 0) facts.push(`${stats.sessions} session${stats.sessions === 1 ? '' : 's'}`);
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${t.display_name}, ${formatMYR(total)}${selected ? ', selected' : ''}`} onPress={onPress}
      style={{ padding: 14, gap: 12, borderRadius: radius.lg, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Avatar name={t.display_name} uri={t.avatar_url} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="subheading" numberOfLines={1}>{t.display_name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Badge label="Verified" tone="success" icon="shield-checkmark" />
            <Rating value={Number(t.rating_avg)} count={t.rating_count} />
          </View>
          {t.headline ? <Text variant="caption" color="textMuted" numberOfLines={2}>{t.headline}</Text> : null}
        </View>
        <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? 'primary' : 'borderStrong'} />
      </View>
      {stats?.registration || facts.length > 0 ? (
        <View style={{ gap: 2 }}>
          {stats?.registration ? <Text variant="caption" color="inkSoft">Reg. no. {stats.registration}</Text> : null}
          {facts.length > 0 ? <Text variant="caption" color="textMuted">{facts.join(' · ')}</Text> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          {t.distance_km != null ? <Text variant="caption" color="textMuted">{formatDistance(Number(t.distance_km))} away</Text> : null}
          {t.languages?.length ? <Text variant="caption" color="textMuted" numberOfLines={1}>Speaks {t.languages.join(', ')}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="heading" color="primaryDark">{formatMYR(total)}</Text>
          {Number(t.travel_fee) > 0 ? <Text variant="caption" color="textMuted">incl. {formatMYR(t.travel_fee)} travel</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Step 3 — "Match me automatically" by default; or pick from who is genuinely free at this exact time. */
export default function YourPhysio() {
  const router = useRouter();
  const { draft, update } = useBookingDraft();
  const { service, type, startAt } = draft;
  const price = useRunningPrice(draft);

  const query = useMemo(
    () => (service && type && startAt ? {
      serviceId: service.id, type, startAt,
      clinicId: type === 'clinic' ? draft.clinicId : null,
      lat: type === 'home' ? draft.address?.latitude : null, lng: type === 'home' ? draft.address?.longitude : null,
    } : null),
    [service, type, startAt, draft.clinicId, draft.address],
  );
  const list = useAvailableTherapists(query);
  const stats = useTherapistStats((list.data ?? []).map((t) => t.therapist_id));

  // Pre-select the physiotherapist the patient came from, if they are actually free.
  useEffect(() => {
    if (draft.preferredTherapistId && !draft.therapist && list.data) {
      const t = list.data.find((x) => x.therapist_id === draft.preferredTherapistId);
      if (t) update({ therapist: { id: t.therapist_id, name: t.display_name } });
    }
  }, [list.data, draft.preferredTherapistId, draft.therapist, update]);

  if (!service || !type || !startAt) { router.replace('/book'); return null; }
  const auto = draft.therapist === null;
  const count = list.data?.length ?? 0;

  return (
    <BookStep step={3} title="Your physio" price={price.amount} priceLabel={price.exact ? 'Total' : 'Service fee'} onNext={() => router.push('/book/review')} nextDisabled={list.isLoading || count === 0}>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: auto }} accessibilityLabel="Match me automatically, recommended" onPress={() => update({ therapist: null })}
        style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, borderWidth: auto ? 2 : 1, borderColor: auto ? colors.primary : colors.border, backgroundColor: auto ? colors.primaryLight : colors.surface }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="flash-outline" size={22} color="primary" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading">Match me automatically</Text>
          <Text variant="caption" color="textMuted">The best available physiotherapist{type === 'home' ? ', nearest first' : ', highest rated first'}.</Text>
        </View>
        <Icon name={auto ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={auto ? 'primary' : 'borderStrong'} />
      </Pressable>

      <Text variant="subheading">{list.isLoading ? 'Checking who is free…' : count > 0 ? `Or choose from ${count} available` : 'Who is free'}</Text>
      {list.isLoading ? <View style={{ gap: 12 }}><Skeleton height={140} rounded={16} /><Skeleton height={140} rounded={16} /></View> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : count === 0 ? (
        <EmptyState icon="people-outline" title="No one is free at this time" body="Someone may have just booked it. Go back and choose another time." actionLabel="Choose another time" onAction={() => router.back()} />
      ) : (
        (list.data ?? []).map((t) => (
          <PhysioChoice key={t.therapist_id} t={t} stats={stats.data?.[t.therapist_id]} selected={draft.therapist?.id === t.therapist_id}
            onPress={() => update({ therapist: { id: t.therapist_id, name: t.display_name } })} />
        ))
      )}

      <View style={{ padding: 16, gap: 12, borderRadius: radius.lg, backgroundColor: colors.primaryLight }}>
        <Text variant="subheading">What to expect</Text>
        {[
          { icon: 'time-outline' as const, text: `A ${formatDuration(service.duration_minutes)} session, tailored to what you need.` },
          { icon: 'body-outline' as const, text: 'Your physio assesses you, treats you and agrees a plan with you.' },
          { icon: 'shirt-outline' as const, text: 'Wear comfortable clothes you can move in.' },
          { icon: 'clipboard-outline' as const, text: 'Afterwards you can get goals and home exercises in the app.' },
        ].map((r) => (
          <View key={r.text} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name={r.icon} size={18} color="primary" />
            <Text variant="caption" color="inkSoft" style={{ flex: 1 }}>{r.text}</Text>
          </View>
        ))}
      </View>
    </BookStep>
  );
}

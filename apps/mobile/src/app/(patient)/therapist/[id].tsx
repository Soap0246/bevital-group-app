import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WEEKDAY_NAMES, formatClock, formatDate, formatMYR } from '@bevital/shared';
import { useTherapist } from '@/api/catalog';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Icon, LoadingList, Rating, Row, Screen, SectionHeader, Text } from '@/components/ui';

export default function TherapistProfile() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useTherapist(id);

  if (q.isLoading) return <Screen title="Physiotherapist"><LoadingList /></Screen>;
  if (q.isError) return <Screen title="Physiotherapist"><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!q.data) return <Screen title="Physiotherapist"><EmptyState icon="person-outline" title="Profile not available" body="This physiotherapist may no longer be accepting bookings." /></Screen>;

  const { profile: t, services, availability, clinic, reviews } = q.data;
  const byDay = new Map<number, string[]>();
  for (const a of availability) byDay.set(a.day_of_week, [...(byDay.get(a.day_of_week) ?? []), `${formatClock(a.start_time)} – ${formatClock(a.end_time)}`]);

  return (
    <Screen title="Physiotherapist" footer={<Button label={`Book with ${t.display_name.split(' ')[0]}`} icon="calendar" disabled={!t.is_accepting_bookings} onPress={() => router.push({ pathname: '/book', params: { therapistId: t.id } })} />}>
      <View style={{ alignItems: 'center', gap: 8, marginTop: 4 }}>
        <Avatar name={t.display_name} uri={t.avatar_url} size={96} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="title" align="center">{t.display_name}</Text>
          <Icon name="shield-checkmark" size={22} color="success" />
        </View>
        {t.headline ? <Text color="textMuted" align="center">{t.headline}</Text> : null}
        <Badge label="Verified by BeVital" tone="success" icon="shield-checkmark" />
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 6 }}>
          <View style={{ alignItems: 'center' }}><Rating value={Number(t.rating_avg)} count={t.rating_count} size={18} /><Text variant="caption" color="textMuted">Rating</Text></View>
          {t.years_experience != null ? <View style={{ alignItems: 'center' }}><Text variant="subheading">{t.years_experience} yrs</Text><Text variant="caption" color="textMuted">Experience</Text></View> : null}
          <View style={{ alignItems: 'center' }}><Text variant="subheading">{services.length}</Text><Text variant="caption" color="textMuted">Services</Text></View>
        </View>
      </View>

      {!t.is_accepting_bookings ? <Card tone="tinted" style={{ marginTop: 16 }}><Text color="inkSoft">Not accepting new bookings right now.</Text></Card> : null}

      {t.bio ? (<><SectionHeader title="About" /><Text color="inkSoft">{t.bio}</Text></>) : null}

      <SectionHeader title="Qualifications & languages" />
      <Card>
        {t.qualifications.length ? t.qualifications.map((qq) => <Row key={qq} icon="school-outline" title={qq} />) : <Text color="textMuted">Qualifications verified by BeVital.</Text>}
        {t.languages.length ? <Row icon="chatbubbles-outline" title="Languages" subtitle={t.languages.join(', ')} last /> : null}
      </Card>

      <SectionHeader title="Where they practise" />
      <Card>
        {t.offers_clinic_visits && clinic ? <Row icon="business-outline" title={clinic.name} subtitle={`${clinic.address_line1}, ${clinic.city}`} /> : null}
        {t.offers_home_visits ? <Row icon="home-outline" title="Home visits" subtitle={`Within about ${t.service_radius_km} km`} last /> : null}
      </Card>

      <SectionHeader title="Services offered" />
      <View style={{ gap: 8 }}>
        {services.map((s) => (
          <Card key={s.id} onPress={() => router.push({ pathname: '/service/[slug]', params: { slug: s.slug } })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}><Text variant="bodyStrong">{s.name}</Text><Text variant="caption" color="textMuted">{s.duration_minutes} min</Text></View>
              <Text variant="bodyStrong" color="primaryDark">{formatMYR(Math.min(...[s.supports_clinic ? s.price_clinic : null, s.supports_home ? s.price_home : null].filter((p): p is number => p != null)))}</Text>
            </View>
          </Card>
        ))}
      </View>

      <SectionHeader title="Weekly availability" />
      <Card>
        {availability.length === 0 ? <Text color="textMuted">Working hours not set yet.</Text> : WEEKDAY_NAMES.map((d, i) => (
          <Row key={d} title={d} subtitle={byDay.get(i + 1)?.join(' · ') ?? 'Not available'} last={i === 6} />
        ))}
        <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>These are regular hours. Exact open times are shown when you book.</Text>
      </Card>

      <SectionHeader title={`Patient reviews (${t.rating_count})`} />
      {reviews.length === 0 ? <Card><Text color="textMuted">No reviews yet. Reviews appear after patients complete a session.</Text></Card> : (
        <View style={{ gap: 10 }}>
          {reviews.map((r) => (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Rating value={r.rating} count={1} /><Text variant="caption" color="textSubtle">{formatDate(r.created_at)}</Text></View>
              {r.comment ? <Text style={{ marginTop: 6 }}>{r.comment}</Text> : null}
              <Text variant="caption" color="textSubtle" style={{ marginTop: 6 }}>Verified patient</Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

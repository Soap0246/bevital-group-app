import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { greetingFor } from '@bevital/shared';
import { useMyBookings } from '@/api/bookings';
import { useArticles, useCategories, useDiscoverTherapists, useFeaturedPromotions } from '@/api/catalog';
import { useNotifications } from '@/api/profile';
import { adherence, streakDays, useRecovery } from '@/api/recovery';
import { AppointmentCard, ArticleCard, CategoryBubble, PromoCard, TherapistCard } from '@/components/domain/cards';
import { ProgressRing } from '@/components/charts/charts';
import { Button, Card, EmptyState, Icon, Logo, Screen, SearchBar, SectionHeader, Skeleton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, radius } from '@/theme';

function HomeHeader() {
  const router = useRouter();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
      <Logo variant="nolb" height={38} />
      <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/notifications')}
        style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="notifications-outline" size={24} />
        {unread > 0 ? <View style={{ position: 'absolute', top: 8, right: 9, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text variant="label" color="surface" style={{ fontSize: 10, lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</Text></View> : null}
      </Pressable>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { profile } = useAuth();
  const [q, setQ] = useState('');
  const categories = useCategories();
  const bookings = useMyBookings();
  const therapists = useDiscoverTherapists();
  const promos = useFeaturedPromotions();
  const articles = useArticles();
  const recovery = useRecovery(null);

  const upcoming = (bookings.data ?? [])
    .filter((b) => !['completed', 'cancelled'].includes(b.status) && new Date(b.scheduled_end) > new Date())
    .sort((a, b) => +new Date(a.scheduled_start) - +new Date(b.scheduled_start))
    .slice(0, 2);
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there';
  const week = recovery.data ? adherence(recovery.data.programmes, recovery.data.completions) : null;
  const refreshing = bookings.isRefetching || therapists.isRefetching;

  return (
    <Screen header={<HomeHeader />} refreshing={refreshing} onRefresh={() => { void bookings.refetch(); void therapists.refetch(); void recovery.refetch(); }}>
      <Text variant="display" style={{ marginTop: 8 }}>{greetingFor()}, {firstName}</Text>
      <Text color="textMuted" style={{ marginBottom: 16 }}>How can we help you today?</Text>

      <SearchBar value={q} onChangeText={setQ} onSubmit={() => router.push({ pathname: '/services', params: { q } })} />

      {/* Primary action */}
      <Card tone="dark" style={{ marginTop: 20, padding: 20 }}>
        <Text variant="label" color="primaryMuted">NO ONE LEFT BEHIND</Text>
        <Text variant="title" color="surface" style={{ marginTop: 6, marginBottom: 14 }}>Book a physiotherapist</Text>
        <Button label="Book now" icon="calendar" onPress={() => router.push('/book')} style={{ backgroundColor: colors.surface }} />
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Home Physiotherapy" onPress={() => router.push({ pathname: '/book', params: { type: 'home' } })} style={tile}>
            <Icon name="home" size={26} color="primary" /><Text variant="bodyStrong" color="surface">Home{'\n'}Physiotherapy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Clinic Appointment" onPress={() => router.push({ pathname: '/book', params: { type: 'clinic' } })} style={tile}>
            <Icon name="business" size={26} color="primary" /><Text variant="bodyStrong" color="surface">Clinic{'\n'}Appointment</Text>
          </Pressable>
        </View>
      </Card>

      <SectionHeader title="Browse services" action="See all" onAction={() => router.push('/services')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
        {categories.isLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} width={82} height={96} rounded={20} />)
          : (categories.data ?? []).map((c) => <CategoryBubble key={c.id} category={c} onPress={() => router.push({ pathname: '/services', params: { category: c.slug } })} />)}
      </ScrollView>

      <SectionHeader title="Upcoming appointments" action={upcoming.length ? 'See all' : undefined} onAction={() => router.push('/bookings')} />
      {bookings.isLoading ? <Skeleton height={120} rounded={20} /> : upcoming.length === 0 ? (
        <Card><EmptyState icon="calendar-outline" title="No upcoming appointments" body="Book your first session — it only takes a minute." actionLabel="Book a physiotherapist" onAction={() => router.push('/book')} /></Card>
      ) : (
        <View style={{ gap: 12 }}>{upcoming.map((b) => <AppointmentCard key={b.id} booking={b} onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })} />)}</View>
      )}

      <SectionHeader title="Available physiotherapists" />
      {therapists.isLoading ? <Skeleton height={110} rounded={20} /> : (therapists.data ?? []).length === 0 ? (
        <Card><Text color="textMuted">Verified physiotherapists will appear here as they join BeVital.</Text></Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
          {(therapists.data ?? []).map((t) => (
            <View key={t.id} style={{ width: 300 }}><TherapistCard therapist={t} compact onPress={() => router.push({ pathname: '/therapist/[id]', params: { id: t.id } })} /></View>
          ))}
        </ScrollView>
      )}

      <SectionHeader title="Recovery progress" action="Open" onAction={() => router.push('/recovery')} />
      {recovery.data && recovery.data.programmes.length > 0 && week ? (
        <Card onPress={() => router.push('/recovery')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
            <ProgressRing value={week.pct} size={96} stroke={10} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="subheading">This week's exercises</Text>
              <Text color="textMuted">{week.done} of {week.expected} done</Text>
              <Text variant="caption" color="primaryDark">{streakDays(recovery.data.completions)}-day streak</Text>
            </View>
          </View>
        </Card>
      ) : (
        <Card tone="tinted"><Text color="inkSoft">Your recovery plan, goals and home exercises will show up here after your first session.</Text></Card>
      )}

      <SectionHeader title="Packages & promotions" action="Packages" onAction={() => router.push('/packages')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
        {(promos.data ?? []).map((p) => <PromoCard key={p.id} promo={p} onPress={() => router.push('/packages')} />)}
        <Card onPress={() => router.push('/packages')} tone="tinted" style={{ width: 230, justifyContent: 'center' }}>
          <Icon name="ticket" size={28} color="primary" />
          <Text variant="subheading" style={{ marginTop: 8 }}>Save with a multi-session package</Text>
        </Card>
      </ScrollView>

      {(articles.data ?? []).length > 0 ? (
        <>
          <SectionHeader title="Health tips" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
            {(articles.data ?? []).map((a) => <ArticleCard key={a.id} article={a} onPress={() => router.push({ pathname: '/article/[slug]', params: { slug: a.slug } })} />)}
          </ScrollView>
        </>
      ) : null}
    </Screen>
  );
}

const tile = { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, paddingHorizontal: 14, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.1)' } as const;

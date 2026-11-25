import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { APPOINTMENT_TYPE_LABELS, formatDate, formatMYR, formatTime, greetingFor, type AppointmentType, type ServiceRow } from '@bevital/shared';
import { useMyBookings, type BookingWithRefs } from '@/api/bookings';
import { useCategories, useFeaturedPromotions, useServices } from '@/api/catalog';
import { useNotifications } from '@/api/profile';
import { Button, Hero, HeroLogo, Icon, Screen, Skeleton, StatusBadge, Text, type IconName } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { useAuth } from '@/lib/auth';
import { DemoPill } from '@/components/DemoAccess';
import { colors, radius, shadow } from '@/theme';

function Bell() {
  const router = useRouter();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/notifications')}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="notifications-outline" size={22} color="surface" />
      {unread > 0 ? (
        <View style={{ position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
          <Text variant="label" color="ink" style={{ fontSize: 10, lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function openDirections(b: BookingWithRefs) {
  const lat = b.appointment_type === 'home' ? b.visit_latitude : b.clinic?.latitude;
  const lng = b.appointment_type === 'home' ? b.visit_longitude : b.clinic?.longitude;
  if (lat != null && lng != null) void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
}

/** The one thing a returning patient most needs: their next visit, its status and the next action. */
function NextVisit({ booking }: { booking: BookingWithRefs }) {
  const router = useRouter();
  const unpaid = booking.status === 'pending';
  const hold = useCountdown(unpaid ? booking.hold_expires_at : null);
  const isHome = booking.appointment_type === 'home';
  const hasPos = (isHome ? booking.visit_latitude : booking.clinic?.latitude) != null;
  const place = isHome ? (booking.visit_address_text ?? 'Home visit') : [booking.clinic?.name, booking.clinic?.city].filter(Boolean).join(', ') || 'Clinic';
  const open = () => router.push({ pathname: '/booking/[id]', params: { id: booking.id } });

  return (
    <View style={[{ borderRadius: radius.xl, backgroundColor: colors.surface, overflow: 'hidden' }, shadow.float]}>
      <LinearGradient colors={[colors.lime, '#5C8F1E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 5 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={`Next visit: ${booking.service?.name ?? 'Physiotherapy'}, ${formatDate(booking.scheduled_start)} at ${formatTime(booking.scheduled_start)}`} onPress={open} style={{ padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="label" color="textMuted">NEXT VISIT</Text>
          <StatusBadge status={booking.status} />
        </View>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <View style={{ width: 56, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.primaryLight }}>
            <Text variant="label" color="primaryDark">{new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', month: 'short' }).format(new Date(booking.scheduled_start)).toUpperCase()}</Text>
            <Text variant="title" color="primaryDark" style={{ fontSize: 24, lineHeight: 28 }}>{new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric' }).format(new Date(booking.scheduled_start))}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading" numberOfLines={2}>{booking.service?.name ?? 'Physiotherapy'}</Text>
            <Text variant="body" color="primaryDark" style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>{formatTime(booking.scheduled_start)} · {APPOINTMENT_TYPE_LABELS[booking.appointment_type]}</Text>
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="person-outline" size={16} color="textMuted" />
            <Text variant="caption" color="inkSoft" style={{ flex: 1 }} numberOfLines={1}>{booking.therapist?.display_name ? `with ${booking.therapist.display_name}` : 'Physio being assigned'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name={isHome ? 'home-outline' : 'location-outline'} size={16} color="textMuted" />
            <Text variant="caption" color="inkSoft" style={{ flex: 1 }} numberOfLines={2}>{place}</Text>
          </View>
        </View>
      </Pressable>
      <View style={{ flexDirection: unpaid ? 'column' : 'row', gap: 10, paddingHorizontal: 18, paddingBottom: 18 }}>
        {unpaid ? (
          <Button
            label={hold.seconds != null && !hold.expired ? `Pay now · ${hold.label} left` : 'Expired'}
            icon="card-outline" size="md" disabled={hold.expired}
            onPress={() => router.push({ pathname: '/book/payment', params: { bookingId: booking.id } })}
          />
        ) : (
          <Button label="View visit" size="md" fullWidth={false} style={{ flex: 1 }} onPress={open} />
        )}
        {hasPos ? <Button label="Directions" icon="navigate-outline" variant="secondary" size="md" fullWidth={unpaid} style={!unpaid ? { flex: 1 } : undefined} onPress={() => openDirections(booking)} /> : null}
      </View>
    </View>
  );
}

const fromPrice = (services: ServiceRow[], type: AppointmentType) => {
  const prices = services.filter((s) => (type === 'home' ? s.supports_home : s.supports_clinic)).map((s) => Number(type === 'home' ? s.price_home : s.price_clinic)).filter((n) => !Number.isNaN(n));
  return prices.length ? Math.min(...prices) : null;
};

// A calm second hue (teal) next to the brand greens keeps the screen lively without becoming loud.
const TILE: Record<AppointmentType, { grad: [string, string]; bubble: string }> = {
  home: { grad: ['#F4FAE6', '#DCEFB6'], bubble: colors.primary },
  clinic: { grad: ['#EAF6F2', '#C9E7DC'], bubble: '#1F7A63' },
};
const POPULAR_TINTS: Array<{ bg: string; fg: string }> = [
  { bg: '#E9F3D6', fg: '#3B6D11' },
  { bg: '#E1F1EC', fg: '#1F7A63' },
  { bg: '#FDF1DC', fg: '#B26A00' },
  { bg: '#E6F0FB', fg: '#2F6FB8' },
];

export default function Home() {
  const router = useRouter();
  const { profile } = useAuth();
  const bookings = useMyBookings();
  const services = useServices();
  const categories = useCategories();
  const promos = useFeaturedPromotions();

  const now = Date.now();
  const next = (bookings.data ?? [])
    // an unpaid booking whose hold has run out is already released: don't show it as an upcoming visit
    .filter((b) => !['completed', 'cancelled'].includes(b.status) && new Date(b.scheduled_end).getTime() > now && !(b.status === 'pending' && b.hold_expires_at && new Date(b.hold_expires_at).getTime() < now))
    .sort((a, b) => +new Date(a.scheduled_start) - +new Date(b.scheduled_start))[0];
  const firstName = (profile?.full_name ?? '').split(' ')[0] || 'there';
  const list = services.data ?? [];
  // Popular = the lead service of each of the first four categories.
  const popular = (categories.data ?? []).slice(0, 4).map((c) => list.find((s) => s.category_id === c.id)).filter((s): s is ServiceRow => !!s);
  const promo = (promos.data ?? []).find((p) => p.code === 'WELCOME10') ?? (promos.data ?? [])[0];

  const tiles: Array<{ type: AppointmentType; icon: IconName; title: string; hint: string }> = [
    { type: 'home', icon: 'home', title: 'Home visit', hint: 'We come to you' },
    { type: 'clinic', icon: 'business', title: 'Clinic visit', hint: 'Visit a BeVital clinic' },
  ];

  return (
    <Screen bleedTop refreshing={bookings.isRefetching} onRefresh={() => { void bookings.refetch(); void services.refetch(); }}>
      <Hero bottom={60}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <HeroLogo />
          <Bell />
        </View>
        <View style={{ marginTop: 14 }}><DemoPill /></View>
        <View style={{ marginTop: 12, gap: 4 }}>
          <Text variant="label" style={{ color: colors.lime, letterSpacing: 1 }}>{greetingFor().toUpperCase()}</Text>
          <Text variant="title" color="surface" accessibilityRole="header">Hi {firstName}, how can we help today?</Text>
        </View>
      </Hero>

      <View style={{ marginTop: -38 }}>
        {bookings.isLoading ? <Skeleton height={190} rounded={20} /> : next ? <NextVisit booking={next} /> : (
          <View style={[{ padding: 18, gap: 10, borderRadius: radius.xl, backgroundColor: colors.surface }, shadow.float]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar" size={24} color="primary" /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">No visits booked yet</Text>
                <Text variant="caption" color="textMuted">Pick how you would like to be treated below. It takes about a minute.</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      <Text variant="heading" style={{ marginTop: 28, marginBottom: 14 }} accessibilityRole="header">How would you like to be treated?</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {tiles.map((t) => {
          const from = fromPrice(list, t.type);
          const c = TILE[t.type];
          return (
            <Pressable key={t.type} accessibilityRole="button" accessibilityLabel={`${t.title}. ${t.hint}${from != null ? `. From ${formatMYR(from)}` : ''}`}
              onPress={() => router.push({ pathname: '/book', params: { type: t.type } })}
              style={({ pressed }) => [{ flex: 1, borderRadius: radius.xl, opacity: pressed ? 0.9 : 1 }, shadow.card]}>
              <LinearGradient colors={c.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ minHeight: 168, padding: 16, borderRadius: radius.xl, justifyContent: 'space-between', overflow: 'hidden' }}>
                <View pointerEvents="none" style={{ position: 'absolute', right: -24, top: -24, width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFFFFF', opacity: 0.45 }} />
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.bubble, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={t.icon} size={24} color="surface" />
                </View>
                <View style={{ gap: 2 }}>
                  <Text variant="subheading" color="ink">{t.title}</Text>
                  <Text variant="caption" color="inkSoft">{t.hint}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    {from != null ? <Text variant="caption" color="ink" style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>From {formatMYR(from)}</Text> : <View />}
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-forward" size={16} color="primary" /></View>
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 30, marginBottom: 12 }}>
        <Text variant="heading" accessibilityRole="header">Popular</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="See all services" hitSlop={10} onPress={() => router.push('/services')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="bodyStrong" color="primary">See all services</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {services.isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="48%" height={72} rounded={16} />) : popular.map((s, i) => {
          const cat = (categories.data ?? []).find((c) => c.id === s.category_id);
          const tint = POPULAR_TINTS[i % POPULAR_TINTS.length];
          return (
            <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.name} onPress={() => router.push({ pathname: '/service/[slug]', params: { slug: s.slug } })}
              style={({ pressed }) => [{ width: '48%', minHeight: 72, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.lg, backgroundColor: colors.surface, opacity: pressed ? 0.88 : 1 }, shadow.card]}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={((cat?.icon as IconName) ?? 'medkit-outline')} size={20} color="primary" />
              </View>
              <Text variant="caption" color="ink" numberOfLines={2} style={{ flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{cat ? cat.name.replace(' Physiotherapy', '').replace(' Rehabilitation', ' Rehab') : s.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {promo ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${promo.title}. Use code ${promo.code}`} onPress={() => router.push({ pathname: '/book', params: { promo: promo.code } })}
          style={({ pressed }) => [{ marginTop: 30, borderRadius: radius.xl, opacity: pressed ? 0.92 : 1 }, shadow.card]}>
          <LinearGradient colors={['#1C3A06', colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden' }}>
            <View pointerEvents="none" style={{ position: 'absolute', right: -30, top: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: colors.lime, opacity: 0.25 }} />
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="gift" size={24} color="ink" />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="bodyStrong" color="surface" numberOfLines={2}>{promo.title}</Text>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <Text variant="label" color="surface">Code {promo.code}</Text>
              </View>
            </View>
            <Icon name="chevron-forward" size={20} color="surface" />
          </LinearGradient>
        </Pressable>
      ) : null}
    </Screen>
  );
}

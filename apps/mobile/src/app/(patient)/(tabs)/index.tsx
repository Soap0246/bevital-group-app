import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { APPOINTMENT_TYPE_LABELS, formatDate, formatMYR, formatTime, greetingFor, type AppointmentType, type ServiceRow } from '@bevital/shared';
import { useMyBookings, type BookingWithRefs } from '@/api/bookings';
import { useCategories, useFeaturedPromotions, useServices } from '@/api/catalog';
import { useNotifications } from '@/api/profile';
import { Badge, Button, Icon, Logo, Screen, Skeleton, StatusBadge, Text, type IconName } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { useAuth } from '@/lib/auth';
import { colors, radius } from '@/theme';

function HomeHeader() {
  const router = useRouter();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
      <Logo variant="nolb" height={40} />
      <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/notifications')}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="notifications-outline" size={22} />
        {unread > 0 ? (
          <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}>
            <Text variant="label" color="surface" style={{ fontSize: 10, lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
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
    <View style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Next visit: ${booking.service?.name ?? 'Physiotherapy'}, ${formatDate(booking.scheduled_start)} at ${formatTime(booking.scheduled_start)}`} onPress={open} style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="label" color="textMuted">NEXT VISIT</Text>
          <StatusBadge status={booking.status} />
        </View>
        <View>
          <Text variant="heading" numberOfLines={2}>{booking.service?.name ?? 'Physiotherapy'}</Text>
          <Text variant="body" color="primaryDark" style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>{formatDate(booking.scheduled_start)} · {formatTime(booking.scheduled_start)}</Text>
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name="person-outline" size={16} color="textMuted" />
            <Text variant="caption" color="inkSoft" style={{ flex: 1 }} numberOfLines={1}>{booking.therapist?.display_name ? `with ${booking.therapist.display_name}` : 'Physio being assigned'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Icon name={isHome ? 'home-outline' : 'business-outline'} size={16} color="textMuted" />
            <Text variant="caption" color="inkSoft" style={{ flex: 1 }} numberOfLines={2}>{APPOINTMENT_TYPE_LABELS[booking.appointment_type]} · {place}</Text>
          </View>
        </View>
      </Pressable>
      <View style={{ flexDirection: unpaid ? 'column' : 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 }}>
        {unpaid ? (
          <Button
            label={hold.seconds != null && !hold.expired ? `Pay now · ${hold.label} left` : 'Expired'}
            icon="card-outline" size="md" disabled={hold.expired}
            onPress={() => router.push({ pathname: '/book/payment', params: { bookingId: booking.id } })}
          />
        ) : (
          <Button label="View visit" size="md" fullWidth={false} style={{ flex: 1 }} onPress={open} />
        )}
        {hasPos ? <Button label="Directions" icon="navigate-outline" variant="outline" size="md" fullWidth={!unpaid ? false : true} style={!unpaid ? { flex: 1 } : undefined} onPress={() => openDirections(booking)} /> : null}
      </View>
    </View>
  );
}

const fromPrice = (services: ServiceRow[], type: AppointmentType) => {
  const prices = services.filter((s) => (type === 'home' ? s.supports_home : s.supports_clinic)).map((s) => Number(type === 'home' ? s.price_home : s.price_clinic)).filter((n) => !Number.isNaN(n));
  return prices.length ? Math.min(...prices) : null;
};

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
    { type: 'home', icon: 'home-outline', title: 'Home visit', hint: 'We come to you' },
    { type: 'clinic', icon: 'business-outline', title: 'Clinic visit', hint: 'Visit a BeVital clinic' },
  ];

  return (
    <Screen header={<HomeHeader />} refreshing={bookings.isRefetching} onRefresh={() => { void bookings.refetch(); void services.refetch(); }}>
      <View style={{ marginTop: 12, marginBottom: 20, gap: 2 }}>
        <Text variant="title" accessibilityRole="header">{greetingFor()}, {firstName}</Text>
        <Text color="textMuted">How can we help you today?</Text>
      </View>

      {bookings.isLoading ? <Skeleton height={176} rounded={20} /> : next ? <NextVisit booking={next} /> : (
        <View style={{ padding: 16, gap: 10, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}><Icon name="calendar-outline" size={22} color="primary" /></View>
          <Text variant="heading">No visits booked yet</Text>
          <Text variant="caption" color="textMuted">Choose how you would like to be treated below. It takes about a minute.</Text>
        </View>
      )}

      <Text variant="heading" style={{ marginTop: 28, marginBottom: 12 }} accessibilityRole="header">How would you like to be treated?</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {tiles.map((t) => {
          const from = fromPrice(list, t.type);
          return (
            <Pressable key={t.type} accessibilityRole="button" accessibilityLabel={`${t.title}. ${t.hint}${from != null ? `. From ${formatMYR(from)}` : ''}`}
              onPress={() => router.push({ pathname: '/book', params: { type: t.type } })}
              style={({ pressed }) => ({ flex: 1, minHeight: 136, padding: 16, gap: 4, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Icon name={t.icon} size={22} color="primary" />
              </View>
              <Text variant="subheading">{t.title}</Text>
              <Text variant="caption" color="textMuted">{t.hint}</Text>
              {from != null ? <Text variant="caption" color="primaryDark" style={{ fontFamily: 'PlusJakartaSans_700Bold', marginTop: 2 }}>From {formatMYR(from)}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 12 }}>
        <Text variant="heading" accessibilityRole="header">Popular</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="See all services" hitSlop={10} onPress={() => router.push('/services')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="bodyStrong" color="primary">See all services</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {services.isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width="48%" height={64} rounded={16} />) : popular.map((s) => {
          const cat = (categories.data ?? []).find((c) => c.id === s.category_id);
          return (
            <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.name} onPress={() => router.push({ pathname: '/service/[slug]', params: { slug: s.slug } })}
              style={({ pressed }) => ({ width: '48%', minHeight: 64, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 })}>
              <Icon name={((cat?.icon as IconName) ?? 'medkit-outline')} size={20} color="primary" />
              <Text variant="caption" color="ink" numberOfLines={2} style={{ flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{cat ? cat.name.replace(' Physiotherapy', '').replace(' Rehabilitation', ' Rehab') : s.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {promo ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${promo.title}. Use code ${promo.code}`} onPress={() => router.push({ pathname: '/book', params: { promo: promo.code } })}
          style={({ pressed }) => ({ marginTop: 28, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, backgroundColor: colors.primaryLight, opacity: pressed ? 0.85 : 1 })}>
          <Icon name="pricetag-outline" size={22} color="primary" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={2}>{promo.title}</Text>
            <Badge label={`Code ${promo.code}`} tone="primary" />
          </View>
          <Icon name="chevron-forward" size={18} color="primary" />
        </Pressable>
      ) : null}
    </Screen>
  );
}

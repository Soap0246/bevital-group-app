import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  APPOINTMENT_TYPE_LABELS, formatDateTime, formatDistance, formatDuration, formatMYR, formatDate, formatTime,
  type AvailableTherapist, type EducationArticleRow, type PromotionRow, type ServiceCategoryRow, type ServiceRow, type TherapistProfileRow,
} from '@bevital/shared';
import { colors, radius } from '@/theme';
import { Avatar, Badge, Card, Icon, Rating, StatusBadge, Text, type IconName } from '@/components/ui';
import type { BookingWithRefs } from '@/api/bookings';
import type { TherapistBooking } from '@/api/therapist';

export function CategoryBubble({ category, onPress, selected }: { category: Pick<ServiceCategoryRow, 'name' | 'icon'>; onPress?: () => void; selected?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={category.name} accessibilityState={{ selected: !!selected }} style={styles.catWrap}>
      <View style={[styles.catIcon, selected && { backgroundColor: colors.primary }]}>
        <Icon name={(category.icon as IconName) ?? 'medkit'} size={26} color={selected ? 'surface' : 'primary'} />
      </View>
      <Text variant="caption" align="center" numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16 }} color="inkSoft">{category.name.replace(' Physiotherapy', '').replace(' Rehabilitation', ' Rehab')}</Text>
    </Pressable>
  );
}

export function startingPrice(s: Pick<ServiceRow, 'price_clinic' | 'price_home' | 'supports_clinic' | 'supports_home'>): number {
  const prices = [s.supports_clinic ? s.price_clinic : null, s.supports_home ? s.price_home : null].filter((p): p is number => p != null);
  return Math.min(...prices.map(Number));
}

export function ServiceCard({ service, category, onPress }: { service: ServiceRow; category?: ServiceCategoryRow; onPress: () => void }) {
  return (
    <Card onPress={onPress} accessibilityLabel={`${service.name}, ${formatDuration(service.duration_minutes)}, from ${formatMYR(startingPrice(service))}`}>
      <View style={styles.rowTop}>
        <View style={styles.serviceIcon}><Icon name={(category?.icon as IconName) ?? 'medkit'} size={22} color="primary" /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading" numberOfLines={2}>{service.name}</Text>
          {category ? <Text variant="caption" color="textMuted">{category.name}</Text> : null}
        </View>
      </View>
      <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 8 }}>{service.description}</Text>
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Badge label={formatDuration(service.duration_minutes)} icon="time-outline" />
          {service.supports_clinic ? <Badge label="Clinic" tone="primary" icon="business-outline" /> : null}
          {service.supports_home ? <Badge label="Home" tone="info" icon="home-outline" /> : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="label" color="textMuted">FROM</Text>
          <Text variant="subheading" color="primaryDark">{formatMYR(startingPrice(service))}</Text>
        </View>
      </View>
    </Card>
  );
}

type TherapistLike = Pick<TherapistProfileRow, 'display_name' | 'avatar_url' | 'headline' | 'years_experience' | 'languages' | 'rating_avg' | 'rating_count'>;

export function TherapistCard({
  therapist, onPress, selected, distanceKm, travelFee, price, compact,
}: { therapist: TherapistLike; onPress?: () => void; selected?: boolean; distanceKm?: number | null; travelFee?: number | null; price?: number | null; compact?: boolean }) {
  return (
    <Card onPress={onPress} style={selected ? { borderColor: colors.primary, borderWidth: 2 } : undefined} accessibilityLabel={`${therapist.display_name}${selected ? ', selected' : ''}`}>
      <View style={styles.rowTop}>
        <Avatar name={therapist.display_name} uri={therapist.avatar_url} size={compact ? 48 : 58} />
        <View style={{ flex: 1, gap: 3 }}>
          <View style={styles.nameRow}>
            <Text variant="subheading" numberOfLines={1} style={{ flexShrink: 1 }}>{therapist.display_name}</Text>
            <Icon name="shield-checkmark" size={17} color="success" />
          </View>
          {therapist.headline ? <Text variant="caption" color="textMuted" numberOfLines={1}>{therapist.headline}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Rating value={Number(therapist.rating_avg)} count={therapist.rating_count} />
            {therapist.years_experience != null ? <Text variant="caption" color="textMuted">{therapist.years_experience} yrs exp.</Text> : null}
          </View>
        </View>
        {selected ? <Icon name="checkmark-circle" size={26} color="primary" /> : null}
      </View>
      {!compact && (distanceKm != null || price != null) ? (
        <View style={[styles.rowBetween, { marginTop: 12 }]}>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {distanceKm != null ? <Badge label={`≈ ${formatDistance(distanceKm)} away`} icon="navigate-outline" /> : null}
            {travelFee != null && travelFee > 0 ? <Badge label={`Travel ${formatMYR(travelFee)}`} tone="warning" /> : null}
            {travelFee === 0 && distanceKm != null ? <Badge label="No travel fee" tone="success" /> : null}
          </View>
          {price != null ? <Text variant="subheading" color="primaryDark">{formatMYR(price)}</Text> : null}
        </View>
      ) : null}
      {!compact && therapist.languages?.length ? (
        <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>Speaks {therapist.languages.join(', ')}</Text>
      ) : null}
    </Card>
  );
}

export function TherapistCardFromSearch({ t, onPress, selected }: { t: AvailableTherapist; onPress: () => void; selected?: boolean }) {
  return (
    <TherapistCard
      therapist={{ display_name: t.display_name, avatar_url: t.avatar_url, headline: t.headline, years_experience: t.years_experience, languages: t.languages, rating_avg: t.rating_avg, rating_count: t.rating_count }}
      onPress={onPress} selected={selected} distanceKm={t.distance_km} travelFee={t.distance_km != null ? t.travel_fee : null} price={Number(t.service_price) + Number(t.travel_fee)}
    />
  );
}

export function AppointmentCard({ booking, onPress, perspective = 'patient' }: { booking: BookingWithRefs | TherapistBooking; onPress: () => void; perspective?: 'patient' | 'therapist' }) {
  const isHome = booking.appointment_type === 'home';
  const who = perspective === 'patient'
    ? (booking.therapist?.display_name ? `with ${booking.therapist.display_name}` : 'Physiotherapist being assigned')
    : `${(booking as TherapistBooking).family?.full_name ?? (booking as TherapistBooking).patient?.full_name ?? 'Patient'}`;
  return (
    <Card onPress={onPress} accessibilityLabel={`${booking.service?.name ?? 'Appointment'}, ${formatDateTime(booking.scheduled_start)}, ${booking.status}`}>
      <View style={styles.rowBetween}>
        <View style={styles.dateBox}>
          <Text variant="label" color="primaryDark">{formatDate(booking.scheduled_start).split(',')[0]?.toUpperCase()}</Text>
          <Text variant="heading" color="primaryDark">{new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric' }).format(new Date(booking.scheduled_start))}</Text>
          <Text variant="label" color="primaryDark">{new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', month: 'short' }).format(new Date(booking.scheduled_start)).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="subheading" numberOfLines={2}>{booking.service?.name ?? 'Physiotherapy'}</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>{who}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="time-outline" size={15} color="textMuted" />
            <Text variant="caption" color="inkSoft">{formatTime(booking.scheduled_start)} – {formatTime(booking.scheduled_end)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={isHome ? 'home-outline' : 'business-outline'} size={15} color="textMuted" />
            <Text variant="caption" color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
              {isHome ? (booking.visit_address_text ?? 'Home visit') : (booking.clinic?.name ?? 'Clinic')}
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.rowBetween, { marginTop: 12 }]}>
        <StatusBadge status={booking.status} />
        <Text variant="caption" color="textSubtle">{APPOINTMENT_TYPE_LABELS[booking.appointment_type]}</Text>
      </View>
    </Card>
  );
}

export function PromoCard({ promo, onPress }: { promo: PromotionRow; onPress?: () => void }) {
  return (
    <Card tone="dark" onPress={onPress} style={styles.promo} accessibilityLabel={`${promo.title}. Use code ${promo.code}`}>
      <Badge label={promo.code} tone="warning" icon="pricetag" />
      <Text variant="subheading" color="surface" style={{ marginTop: 10 }} numberOfLines={3}>{promo.title}</Text>
      {promo.description ? <Text variant="caption" color="primaryMuted" numberOfLines={2} style={{ marginTop: 4 }}>{promo.description}</Text> : null}
    </Card>
  );
}

export function ArticleCard({ article, onPress }: { article: EducationArticleRow; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ width: 250 }} accessibilityLabel={article.title}>
      <Badge label={article.category ?? 'Health tip'} tone="primary" />
      <Text variant="subheading" numberOfLines={3} style={{ marginTop: 10 }}>{article.title}</Text>
      <Text variant="caption" color="textMuted" numberOfLines={2} style={{ marginTop: 4 }}>{article.summary}</Text>
      <Text variant="caption" color="textSubtle" style={{ marginTop: 10 }}>{article.reading_minutes} min read</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  catWrap: { width: 82, alignItems: 'center', gap: 8 },
  catIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serviceIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  dateBox: { width: 62, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.primaryLight, marginRight: 12 },
  promo: { width: 270, minHeight: 150, justifyContent: 'flex-start' },
});

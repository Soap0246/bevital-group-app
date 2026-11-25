import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatDuration, formatMYR, type AppointmentType, type ServiceRow } from '@bevital/shared';
import { useCategories, useServices, useTherapist } from '@/api/catalog';
import { useFamily } from '@/api/profile';
import { BookStep } from '@/components/domain/BookStep';
import { Banner, Badge, Button, Chip, ChipRow, Icon, LoadingList, Text } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { colors, radius } from '@/theme';

const DEFAULT_SERVICE_SLUG = 'msk-assessment';
const priceFor = (s: ServiceRow, type: AppointmentType | null) => Number(type === 'clinic' ? s.price_clinic : s.price_home);
const supports = (s: ServiceRow, type: AppointmentType | null) => (type === 'clinic' ? s.supports_clinic : type === 'home' ? s.supports_home : true);

/** Step 1 — who it is for, where, and which service. Accepts ?serviceId, ?type, ?therapistId and ?promo from other screens. */
export default function WhatDoYouNeed() {
  const router = useRouter();
  const { serviceId, type: typeParam, therapistId, promo } = useLocalSearchParams<{ serviceId?: string; type?: string; therapistId?: string; promo?: string }>();
  const { draft, update } = useBookingDraft();
  const services = useServices();
  const categories = useCategories();
  const family = useFamily();
  const therapist = useTherapist(therapistId);
  const [showAll, setShowAll] = useState(false);
  const [cat, setCat] = useState<string | null>(null);

  // Apply deep-link presets once, on a fresh booking only (never on top of a draft the user is editing).
  useEffect(() => {
    if (draft.type) return;
    update({
      type: typeParam === 'clinic' ? 'clinic' : 'home',
      preferredTherapistId: therapistId ?? null,
      promoCode: promo ? String(promo).toUpperCase() : '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offered = useMemo(() => {
    const ids = therapistId ? new Set((therapist.data?.services ?? []).map((s) => s.id)) : null;
    return (services.data ?? []).filter((s) => (!ids || ids.has(s.id)) && supports(s, draft.type));
  }, [services.data, therapist.data, therapistId, draft.type]);

  // Default to the initial assessment ("not sure? start here"), or the service the user came from.
  useEffect(() => {
    if (!draft.type || !services.data) return;
    if (draft.service && supports(draft.service, draft.type)) return;
    const wanted = serviceId ? offered.find((s) => s.id === serviceId) : undefined;
    const pick = wanted ?? offered.find((s) => s.slug === DEFAULT_SERVICE_SLUG) ?? offered[0];
    if (pick) update({ service: pick });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.type, services.data, offered]);

  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]));
  const s = draft.service;
  const base = (type: AppointmentType) => {
    const list = (services.data ?? []).filter((x) => supports(x, type));
    const prices = list.map((x) => priceFor(x, type)).filter((n) => !Number.isNaN(n));
    return prices.length ? Math.min(...prices) : null;
  };

  const next = () => router.push('/book/time');

  return (
    <BookStep step={1} title="What do you need?" price={s && draft.type ? priceFor(s, draft.type) : null} priceLabel="Service fee" onNext={next} nextDisabled={!s || !draft.type}>
      {therapistId && therapist.data ? <Banner tone="info" icon="person-outline" title={`Booking with ${therapist.data.profile.display_name}`} body="Showing the services this physiotherapist offers." /> : null}

      <View style={{ gap: 10 }}>
        <Text variant="subheading">Who is it for?</Text>
        <ChipRow>
          <Chip label="Me" icon="person-outline" selected={!draft.familyMemberId} onPress={() => update({ familyMemberId: null, familyMemberName: null })} />
          {(family.data ?? []).map((m) => (
            <Chip key={m.id} label={m.full_name} icon="people-outline" selected={draft.familyMemberId === m.id} onPress={() => update({ familyMemberId: m.id, familyMemberName: m.full_name })} />
          ))}
          <Chip label="Add" icon="add" onPress={() => router.push('/family')} />
        </ChipRow>
        {draft.familyMemberId ? <Text variant="caption" color="textMuted">Booking for {draft.familyMemberName}. You are acting as their authorised representative.</Text> : null}
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="subheading">Where would you like treatment?</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {([
            { type: 'home' as const, icon: 'home-outline' as const, title: 'Home visit', hint: 'We come to you' },
            { type: 'clinic' as const, icon: 'business-outline' as const, title: 'Clinic visit', hint: 'Visit a BeVital clinic' },
          ]).map((o) => {
            const on = draft.type === o.type;
            const from = base(o.type);
            return (
              <Pressable key={o.type} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${o.title}, ${o.hint}`}
                onPress={() => update({ type: o.type })}
                style={{ flex: 1, minHeight: 112, padding: 14, gap: 6, borderRadius: radius.lg, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primaryLight : colors.surface }}>
                <Icon name={o.icon} size={24} color={on ? 'primary' : 'inkSoft'} />
                <Text variant="subheading">{o.title}</Text>
                <Text variant="caption" color="textMuted">{o.hint}</Text>
                {from != null ? <Text variant="caption" color="primaryDark" style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>from {formatMYR(from)}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Text variant="subheading">Service</Text>
        {services.isLoading ? <LoadingList count={1} /> : s ? (
          <View style={{ padding: 14, gap: 8, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading">{s.name}</Text>
                <Text variant="caption" color="textMuted">{formatDuration(s.duration_minutes)} · {formatMYR(priceFor(s, draft.type))}</Text>
              </View>
              <Icon name="checkmark-circle" size={22} color="primary" />
            </View>
            {s.slug === DEFAULT_SERVICE_SLUG ? <Badge label="Not sure? Start here" tone="primary" icon="sparkles-outline" /> : null}
            <Text variant="caption" color="textMuted" numberOfLines={2}>{s.description}</Text>
          </View>
        ) : null}
        <Button label={showAll ? 'Hide services' : 'See all services'} variant="ghost" size="md" icon={showAll ? 'chevron-up' : 'chevron-down'} onPress={() => setShowAll((v) => !v)} />
      </View>

      {showAll ? (
        <View style={{ gap: 10 }}>
          <ChipRow>
            <Chip label="All" selected={cat === null} onPress={() => setCat(null)} />
            {(categories.data ?? []).map((c) => <Chip key={c.id} label={c.name.replace(' Physiotherapy', '').replace(' Rehabilitation', ' Rehab')} selected={cat === c.id} onPress={() => setCat(c.id)} />)}
          </ChipRow>
          {offered.filter((x) => !cat || x.category_id === cat).map((x) => {
            const on = s?.id === x.id;
            return (
              <Pressable key={x.id} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${x.name}, ${formatDuration(x.duration_minutes)}, ${formatMYR(priceFor(x, draft.type))}`}
                onPress={() => { update({ service: x }); setShowAll(false); }}
                style={{ minHeight: 56, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: colors.surface }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={2}>{x.name}</Text>
                  <Text variant="caption" color="textMuted">{catById.get(x.category_id)?.name} · {formatDuration(x.duration_minutes)}</Text>
                </View>
                <Text variant="bodyStrong" color="primaryDark">{formatMYR(priceFor(x, draft.type))}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </BookStep>
  );
}

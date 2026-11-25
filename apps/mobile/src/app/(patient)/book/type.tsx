import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatMYR } from '@bevital/shared';
import { useFamily } from '@/api/profile';
import { BookStep } from '@/components/domain/BookStep';
import { Banner, Button, Card, Chip, ChipRow, Icon, Text } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';

/** Step 2 — clinic or home, and who the appointment is for. */
export default function SelectType() {
  const router = useRouter();
  const { draft, update } = useBookingDraft();
  const family = useFamily();
  const s = draft.service;
  if (!s) { router.replace('/book'); return null; }

  const options = [
    { type: 'clinic' as const, icon: 'business' as const, title: 'Clinic physiotherapy', body: 'Visit one of our BeVital clinics.', price: s.price_clinic, ok: s.supports_clinic },
    { type: 'home' as const, icon: 'home' as const, title: 'Home physiotherapy', body: 'Your physiotherapist comes to you. Travel fee depends on distance.', price: s.price_home, ok: s.supports_home },
  ];

  return (
    <BookStep step={2} title="Where would you like treatment?" footer={<Button label="Continue" disabled={!draft.type} onPress={() => router.push('/book/location')} />}>
      <Text color="textMuted">{s.name}</Text>
      {options.map((o) => (
        <Card
          key={o.type}
          onPress={o.ok ? () => update({ type: o.type }) : undefined}
          style={draft.type === o.type ? { borderColor: '#0E7C86', borderWidth: 2 } : o.ok ? undefined : { opacity: 0.5 }}
          accessibilityLabel={`${o.title}${o.ok ? '' : ', not available for this service'}`}
        >
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: '#E3F4F5', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={o.icon} size={26} color="primary" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="subheading">{o.title}</Text>
              <Text variant="caption" color="textMuted">{o.ok ? o.body : 'Not available for this service'}</Text>
              {o.ok && o.price != null ? <Text variant="bodyStrong" color="primaryDark">{formatMYR(o.price)}</Text> : null}
            </View>
            {draft.type === o.type ? <Icon name="checkmark-circle" size={26} color="primary" /> : null}
          </View>
        </Card>
      ))}

      <View style={{ gap: 8, marginTop: 8 }}>
        <Text variant="subheading">Who is this appointment for?</Text>
        <ChipRow>
          <Chip label="Me" selected={!draft.familyMemberId} onPress={() => update({ familyMemberId: null, familyMemberName: null })} icon="person" />
          {(family.data ?? []).map((m) => (
            <Chip key={m.id} label={m.full_name} selected={draft.familyMemberId === m.id} icon="people" onPress={() => update({ familyMemberId: m.id, familyMemberName: m.full_name })} />
          ))}
          <Chip label="Add family member" icon="add" onPress={() => router.push('/family')} />
        </ChipRow>
        {draft.familyMemberId ? <Banner tone="info" icon="shield-checkmark-outline" title={`Booking for ${draft.familyMemberName}`} body="You are acting as their authorised representative. Their health information stays in your account." /> : null}
      </View>
    </BookStep>
  );
}

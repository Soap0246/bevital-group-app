import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClinics } from '@/api/catalog';
import { useAddresses } from '@/api/profile';
import { BookStep } from '@/components/domain/BookStep';
import { Button, Card, EmptyState, Icon, LoadingList, Text } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';

/** Step 3 — pick a clinic, or the address for the home visit. */
export default function SelectLocation() {
  const router = useRouter();
  const { draft, update } = useBookingDraft();
  const clinics = useClinics();
  const addresses = useAddresses();
  if (!draft.service || !draft.type) { router.replace('/book'); return null; }

  const isHome = draft.type === 'home';
  const ready = isHome ? !!draft.address : !!draft.clinicId;

  return (
    <BookStep step={3} title={isHome ? 'Where should we visit?' : 'Choose a clinic'} footer={<Button label="Continue" disabled={!ready} onPress={() => router.push('/book/time')} />}>
      {isHome ? (
        <>
          {addresses.isLoading ? <LoadingList count={2} /> : (addresses.data ?? []).length === 0 ? (
            <EmptyState icon="location-outline" title="No saved addresses" body="Add the address where you'd like to be treated. Pin it on the map so your physiotherapist can find you." />
          ) : (
            (addresses.data ?? []).map((a) => (
              <Card key={a.id} onPress={() => update({ address: a })} style={draft.address?.id === a.id ? { borderColor: '#0E7C86', borderWidth: 2 } : undefined} accessibilityLabel={`${a.label}, ${a.line1}`}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Icon name={a.label.toLowerCase() === 'work' ? 'briefcase-outline' : 'home-outline'} size={24} color="primary" />
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading">{a.label}{a.is_default ? '  · Default' : ''}</Text>
                    <Text variant="caption" color="textMuted">{[a.line1, a.line2, `${a.postcode} ${a.city}`, a.state].filter(Boolean).join(', ')}</Text>
                  </View>
                  {draft.address?.id === a.id ? <Icon name="checkmark-circle" size={26} color="primary" /> : null}
                </View>
              </Card>
            ))
          )}
          <Button label="Add a new address" variant="secondary" icon="add" onPress={() => router.push({ pathname: '/address/edit', params: { returnTo: 'book' } })} />
        </>
      ) : (
        <>
          {clinics.isLoading ? <LoadingList count={2} /> : (clinics.data ?? []).map((c) => (
            <Card key={c.id} onPress={() => update({ clinicId: c.id, clinicName: c.name })} style={draft.clinicId === c.id ? { borderColor: '#0E7C86', borderWidth: 2 } : undefined} accessibilityLabel={c.name}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Icon name="business-outline" size={24} color="primary" />
                <View style={{ flex: 1 }}>
                  <Text variant="subheading">{c.name}</Text>
                  <Text variant="caption" color="textMuted">{[c.address_line1, `${c.postcode} ${c.city}`, c.state].join(', ')}</Text>
                  {c.phone ? <Text variant="caption" color="textSubtle">{c.phone}</Text> : null}
                </View>
                {draft.clinicId === c.id ? <Icon name="checkmark-circle" size={26} color="primary" /> : null}
              </View>
            </Card>
          ))}
        </>
      )}
    </BookStep>
  );
}

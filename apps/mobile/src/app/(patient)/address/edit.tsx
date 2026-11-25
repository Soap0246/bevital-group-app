import React, { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addressSchema, friendlyError } from '@bevital/shared';
import { useAddresses, useSaveAddress } from '@/api/profile';
import { LocationPicker } from '@/components/map/LocationPicker';
import { Banner, Button, Chip, ChipRow, Input, Screen, Text, useToast } from '@/components/ui';
import type { GeocodedPlace } from '@/lib/geocoding';
import { colors } from '@/theme';

const LABELS = ['Home', 'Work', 'Parents', 'Other'];

/** Step 1: pin the location on the map (or search). Step 2: confirm the address details. */
export default function AddressEdit() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const addresses = useAddresses();
  const save = useSaveAddress();
  const existing = (addresses.data ?? []).find((a) => a.id === id);
  const [place, setPlace] = useState<GeocodedPlace | null>(null);
  const [f, setF] = useState({ label: 'Home', line1: '', line2: '', city: '', state: '', postcode: '', accessNotes: '', isDefault: false });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setPlace({ label: existing.line1, line1: existing.line1, city: existing.city, state: existing.state, postcode: existing.postcode, latitude: Number(existing.latitude), longitude: Number(existing.longitude), placeId: existing.place_id ?? undefined });
      setF({ label: existing.label, line1: existing.line1, line2: existing.line2 ?? '', city: existing.city, state: existing.state, postcode: existing.postcode, accessNotes: existing.access_notes ?? '', isDefault: existing.is_default });
    }
  }, [existing]);

  const onPicked = (p: GeocodedPlace) => {
    setPlace(p);
    setF((cur) => ({ ...cur, line1: cur.line1 || p.line1, city: cur.city || p.city, state: cur.state || p.state, postcode: cur.postcode || p.postcode }));
  };

  if (!place) {
    return (
      <Screen title="Pin your location" scroll={false} padded={false}>
        <LocationPicker initial={existing ? { latitude: Number(existing.latitude), longitude: Number(existing.longitude) } : null} confirmLabel="Use this location" onConfirm={onPicked} />
      </Screen>
    );
  }

  const submit = async () => {
    setErr(null);
    const parsed = addressSchema.safeParse({ label: f.label, line1: f.line1, line2: f.line2 || undefined, city: f.city, state: f.state, postcode: f.postcode, latitude: place.latitude, longitude: place.longitude, accessNotes: f.accessNotes || undefined, isDefault: f.isDefault });
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Check the address'); return; }
    const v = parsed.data;
    try {
      await save.mutateAsync({ id: existing?.id, data: { label: v.label, line1: v.line1, line2: v.line2 ?? null, city: v.city, state: v.state, postcode: v.postcode, latitude: v.latitude, longitude: v.longitude, access_notes: v.accessNotes ?? null, is_default: v.isDefault, place_id: place.placeId ?? null } });
      toast.show('Address saved');
      router.back();
    } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <Screen title="Address details" footer={<Button label="Save address" loading={save.isPending} onPress={submit} />}>
      <View style={{ gap: 14 }}>
        <Banner tone="success" icon="location" title="Location pinned" body={`${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)} — your physiotherapist will navigate here.`} />
        <Button label="Change pin on map" variant="ghost" size="md" onPress={() => setPlace(null)} />
        {err ? <Text color="danger">{err}</Text> : null}
        <ChipRow>{LABELS.map((l) => <Chip key={l} label={l} selected={f.label === l} onPress={() => setF({ ...f, label: l })} />)}</ChipRow>
        <Input label="Street address" value={f.line1} onChangeText={(t) => setF({ ...f, line1: t })} />
        <Input label="Unit / floor / building (optional)" value={f.line2} onChangeText={(t) => setF({ ...f, line2: t })} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Input label="Postcode" value={f.postcode} onChangeText={(t) => setF({ ...f, postcode: t })} keyboardType="number-pad" maxLength={5} /></View>
          <View style={{ flex: 1.4 }}><Input label="City" value={f.city} onChangeText={(t) => setF({ ...f, city: t })} /></View>
        </View>
        <Input label="State" value={f.state} onChangeText={(t) => setF({ ...f, state: t })} placeholder="e.g. Selangor" />
        <Input label="Access notes (optional)" multiline value={f.accessNotes} onChangeText={(t) => setF({ ...f, accessNotes: t })} placeholder="Guardhouse, lift, parking, gate code…" />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Switch value={f.isDefault} onValueChange={(v) => setF({ ...f, isDefault: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} />
          <Text>Make this my default address</Text>
        </View>
      </View>
    </Screen>
  );
}

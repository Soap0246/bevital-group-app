import React, { useState } from 'react';
import { View } from 'react-native';
import * as Location from 'expo-location';
import { Banner, Button, Input, Text } from '@/components/ui';
import { reverseGeocode, searchAddress, type GeocodedPlace } from '@/lib/geocoding';
import type { LocationPickerProps } from './types';

/**
 * Web fallback (browser preview only). The interactive map is native-only; here you can search an
 * address (needs EXPO_PUBLIC_GOOGLE_MAPS_API_KEY), use browser geolocation, or type coordinates.
 */
export function LocationPicker({ initial, confirmLabel = 'Confirm location', onConfirm }: LocationPickerProps) {
  const [query, setQuery] = useState('');
  const [lat, setLat] = useState(String(initial?.latitude ?? '3.139'));
  const [lng, setLng] = useState(String(initial?.longitude ?? '101.6869'));
  const [place, setPlace] = useState<GeocodedPlace | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true); setMsg(null);
    try {
      const [first] = await searchAddress(query);
      if (first) { setPlace(first); setLat(String(first.latitude)); setLng(String(first.longitude)); }
      else setMsg('No match found. Address search on web needs a Google Maps API key; you can enter coordinates instead.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const locate = async () => {
    setBusy(true); setMsg(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setMsg('Location permission denied.'); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setLat(String(pos.coords.latitude)); setLng(String(pos.coords.longitude));
      setPlace((await reverseGeocode(pos.coords.latitude, pos.coords.longitude)) ?? null);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const confirm = () => {
    const latitude = Number(lat); const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) { setMsg('Enter valid coordinates.'); return; }
    onConfirm(place ?? { label: `${latitude}, ${longitude}`, line1: '', city: '', state: '', postcode: '', latitude, longitude });
  };

  return (
    <View style={{ flex: 1, padding: 20, gap: 14 }}>
      <Banner tone="info" icon="map-outline" title="Map picker runs in the mobile app" body="This browser preview lets you search or enter coordinates instead." />
      <Input label="Search address" value={query} onChangeText={setQuery} onSubmitEditing={search} placeholder="e.g. Jalan Ampang, Kuala Lumpur" />
      <Button label="Search" variant="secondary" onPress={search} loading={busy} />
      <Button label="Use my location" variant="outline" icon="locate" onPress={locate} loading={busy} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Input label="Latitude" value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" /></View>
        <View style={{ flex: 1 }}><Input label="Longitude" value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" /></View>
      </View>
      {place ? <Text variant="caption" color="textMuted">{place.label}</Text> : null}
      {msg ? <Text variant="caption" color="danger">{msg}</Text> : null}
      <Button label={confirmLabel} onPress={confirm} />
    </View>
  );
}

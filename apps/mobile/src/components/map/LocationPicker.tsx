import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { colors, radius, shadow } from '@/theme';
import { Button, Icon, SearchBar, Text } from '@/components/ui';
import { reverseGeocode, searchAddress, type GeocodedPlace } from '@/lib/geocoding';
import type { LocationPickerProps } from './types';

const KUALA_LUMPUR: Region = { latitude: 3.139, longitude: 101.6869, latitudeDelta: 0.05, longitudeDelta: 0.05 };

/**
 * Grab-style location picker: drag the map under a fixed centre pin, or search an address, or use the
 * device location. Geocoding goes through src/lib/geocoding.ts (Google when a key is configured,
 * otherwise the device geocoder) — swap the provider there to use Mapbox.
 */
export function LocationPicker({ initial, confirmLabel = 'Confirm location', onConfirm }: LocationPickerProps) {
  const mapRef = useRef<MapView>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [place, setPlace] = useState<GeocodedPlace | null>(null);
  const [resolving, setResolving] = useState(false);
  const [center, setCenter] = useState({ latitude: initial?.latitude ?? KUALA_LUMPUR.latitude, longitude: initial?.longitude ?? KUALA_LUMPUR.longitude });
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolve = useCallback(async (latitude: number, longitude: number) => {
    setResolving(true);
    setError(null);
    try {
      const p = await reverseGeocode(latitude, longitude);
      setPlace(p ?? { label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, line1: '', city: '', state: '', postcode: '', latitude, longitude });
    } catch {
      setPlace({ label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, line1: '', city: '', state: '', postcode: '', latitude, longitude });
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    void resolve(center.latitude, center.longitude);
    // initial resolve only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 3) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { setResults(await searchAddress(query)); } catch { setResults([]); } finally { setSearching(false); }
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  const flyTo = (latitude: number, longitude: number) => {
    mapRef.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 450);
  };

  const useMyLocation = async () => {
    setError(null);
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') { setError('Location permission was denied. You can still search for your address.'); return; }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    flyTo(pos.coords.latitude, pos.coords.longitude);
    setCenter(pos.coords);
    void resolve(pos.coords.latitude, pos.coords.longitude);
  };

  const pick = (p: GeocodedPlace) => {
    setResults([]);
    setQuery('');
    setPlace(p);
    setCenter({ latitude: p.latitude, longitude: p.longitude });
    flyTo(p.latitude, p.longitude);
  };

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...KUALA_LUMPUR, latitude: center.latitude, longitude: center.longitude }}
        showsUserLocation
        showsMyLocationButton={false}
        onRegionChangeComplete={(r) => {
          setCenter({ latitude: r.latitude, longitude: r.longitude });
          void resolve(r.latitude, r.longitude);
        }}
        accessibilityLabel="Map. Drag to move the pin to your location."
      />
      {/* fixed centre pin */}
      <View pointerEvents="none" style={styles.pinWrap}>
        <Icon name="location-sharp" size={44} color="primary" />
        <View style={styles.pinShadow} />
      </View>

      <View style={styles.top}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search your address" />
        {searching ? <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} /> : null}
        {results.length > 0 ? (
          <FlatList
            style={styles.results}
            data={results}
            keyExtractor={(r, i) => `${r.latitude},${r.longitude},${i}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => pick(item)} style={styles.result} accessibilityRole="button" accessibilityLabel={item.label}>
                <Icon name="location-outline" size={20} color="primary" />
                <Text variant="caption" style={{ flex: 1 }} numberOfLines={2}>{item.label}</Text>
              </Pressable>
            )}
          />
        ) : null}
      </View>

      <Pressable onPress={useMyLocation} style={styles.gps} accessibilityRole="button" accessibilityLabel="Use my current location">
        <Icon name="locate" size={24} color="primary" />
      </Pressable>

      <View style={styles.bottom}>
        {error ? <Text variant="caption" color="danger">{error}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="pin" size={20} color="primary" />
          {resolving ? <Text color="textMuted">Finding address…</Text> : <Text variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }}>{place?.label ?? 'Move the map to set your location'}</Text>}
        </View>
        <Button label={confirmLabel} disabled={!place || resolving} onPress={() => place && onConfirm({ ...place, latitude: center.latitude, longitude: center.longitude })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceAlt },
  pinWrap: { position: 'absolute', top: '50%', left: '50%', marginLeft: -22, marginTop: -44, alignItems: 'center' },
  pinShadow: { width: 10, height: 4, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.25)', marginTop: -2 },
  top: { position: 'absolute', top: 12, left: 16, right: 16 },
  results: { marginTop: 8, maxHeight: 240, backgroundColor: colors.surface, borderRadius: radius.md, ...shadow.float },
  result: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  gps: { position: 'absolute', right: 16, bottom: 190, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.float },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 12, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadow.float },
});

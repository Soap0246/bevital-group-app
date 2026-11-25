import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { env } from '@/config/env';

/**
 * Address search & reverse geocoding.
 *
 *  • With EXPO_PUBLIC_GOOGLE_MAPS_API_KEY set → Google Geocoding API (works on every platform).
 *  • Without a key → the device geocoder via expo-location (native only; no key needed).
 *
 * Swapping to Mapbox means re-implementing these two functions — nothing else depends on the vendor.
 */
export interface GeocodedPlace {
  label: string;
  line1: string;
  city: string;
  state: string;
  postcode: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

interface GoogleResult {
  formatted_address: string;
  place_id: string;
  geometry: { location: { lat: number; lng: number } };
  address_components: Array<{ long_name: string; types: string[] }>;
}

function fromGoogle(r: GoogleResult): GeocodedPlace {
  const part = (type: string) => r.address_components.find((c) => c.types.includes(type))?.long_name ?? '';
  const street = [part('street_number'), part('route')].filter(Boolean).join(' ');
  return {
    label: r.formatted_address,
    line1: street || part('sublocality') || part('premise') || r.formatted_address.split(',')[0] || '',
    city: part('locality') || part('administrative_area_level_2') || part('sublocality'),
    state: part('administrative_area_level_1'),
    postcode: part('postal_code'),
    latitude: r.geometry.location.lat,
    longitude: r.geometry.location.lng,
    placeId: r.place_id,
  };
}

async function googleFetch(params: Record<string, string>): Promise<GoogleResult[]> {
  const qs = new URLSearchParams({ ...params, key: env.googleMapsApiKey, region: 'my' });
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
  const json = await res.json();
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`Geocoding failed: ${json.status}`);
  }
  return (json.results ?? []) as GoogleResult[];
}

export async function searchAddress(query: string): Promise<GeocodedPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  if (env.googleMapsApiKey) {
    return (await googleFetch({ address: `${q}, Malaysia` })).map(fromGoogle);
  }
  if (Platform.OS === 'web') return [];
  const hits = await Location.geocodeAsync(`${q}, Malaysia`);
  const places = await Promise.all(hits.slice(0, 5).map((h) => reverseGeocode(h.latitude, h.longitude)));
  return places.filter((p): p is GeocodedPlace => p !== null);
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodedPlace | null> {
  if (env.googleMapsApiKey) {
    const [first] = await googleFetch({ latlng: `${latitude},${longitude}` });
    return first ? fromGoogle(first) : null;
  }
  if (Platform.OS === 'web') return null;
  const [a] = await Location.reverseGeocodeAsync({ latitude, longitude });
  if (!a) return null;
  const line1 = [a.streetNumber, a.street ?? a.name].filter(Boolean).join(' ') || a.name || '';
  return {
    label: [line1, a.district, a.city, a.region, a.postalCode].filter(Boolean).join(', '),
    line1,
    city: a.city ?? a.subregion ?? '',
    state: a.region ?? '',
    postcode: a.postalCode ?? '',
    latitude,
    longitude,
  };
}

/** Straight-line distance in km (for "approx. X km away"; not a road distance). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

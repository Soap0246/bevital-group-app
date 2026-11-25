import type { GeocodedPlace } from '@/lib/geocoding';

export interface LocationPickerProps {
  initial?: { latitude: number; longitude: number } | null;
  confirmLabel?: string;
  onConfirm: (place: GeocodedPlace) => void;
}

export interface TrackingMapProps {
  destination: { latitude: number; longitude: number };
  /** Real therapist position from therapist_live_locations. null = no live source, so nothing is drawn. */
  therapist: { latitude: number; longitude: number } | null;
}

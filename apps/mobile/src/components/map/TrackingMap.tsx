import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { colors, radius } from '@/theme';
import type { TrackingMapProps } from './types';

/** Patient-facing live map. Only rendered when a real therapist GPS fix exists; nothing is simulated. */
export function TrackingMap({ destination, therapist }: TrackingMapProps) {
  const coords = therapist ? [destination, therapist] : [destination];
  const latitude = coords.reduce((s, c) => s + c.latitude, 0) / coords.length;
  const longitude = coords.reduce((s, c) => s + c.longitude, 0) / coords.length;
  const span = therapist
    ? Math.max(0.01, Math.abs(destination.latitude - therapist.latitude) * 2.4, Math.abs(destination.longitude - therapist.longitude) * 2.4)
    : 0.01;
  return (
    <View style={styles.wrap}>
      <MapView style={StyleSheet.absoluteFill} region={{ latitude, longitude, latitudeDelta: span, longitudeDelta: span }} accessibilityLabel="Live map of your physiotherapist and your address">
        <Marker coordinate={destination} title="Your location" pinColor={colors.ink} />
        {therapist ? <Marker coordinate={therapist} title="Your physiotherapist" pinColor={colors.primary} /> : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { height: 220, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceAlt } });

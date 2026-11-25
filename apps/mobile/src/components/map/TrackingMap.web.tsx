import React from 'react';
import { View } from 'react-native';
import { Card, Text } from '@/components/ui';
import { haversineKm } from '@/lib/geocoding';
import type { TrackingMapProps } from './types';

export function TrackingMap({ destination, therapist }: TrackingMapProps) {
  return (
    <Card tone="tinted">
      <View style={{ gap: 4 }}>
        <Text variant="bodyStrong">Live map is available in the mobile app</Text>
        {therapist ? (
          <Text color="inkSoft">Physiotherapist is approx. {haversineKm(therapist.latitude, therapist.longitude, destination.latitude, destination.longitude).toFixed(1)} km away (straight line).</Text>
        ) : (
          <Text color="inkSoft">Waiting for your physiotherapist's location…</Text>
        )}
      </View>
    </Card>
  );
}

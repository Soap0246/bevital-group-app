import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useClinics } from '@/api/catalog';
import { ClinicMap } from '@/components/map/ClinicMap';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, LoadingList, Screen, Text } from '@/components/ui';
import { colors } from '@/theme';

/** BeVital clinic locator: interactive Leaflet / OpenStreetMap map synced with a list of clinic details. */
export default function Clinics() {
  const router = useRouter();
  const clinics = useClinics();
  const [selected, setSelected] = useState<string | null>(null);
  const list = clinics.data ?? [];
  const mappable = list.filter((c) => c.latitude != null && c.longitude != null);

  return (
    <Screen title="BeVital clinics" subtitle="Find a clinic near you" refreshing={clinics.isRefetching} onRefresh={() => void clinics.refetch()}>
      <View style={{ gap: 14, marginTop: 4 }}>
        {clinics.isLoading ? <LoadingList count={2} /> : clinics.isError ? <ErrorState error={clinics.error} onRetry={() => clinics.refetch()} /> : list.length === 0 ? (
          <EmptyState icon="business-outline" title="No clinics yet" body="BeVital clinics will appear here as they open." />
        ) : (
          <>
            {mappable.length > 0 ? <ClinicMap clinics={mappable} selectedId={selected} onSelect={setSelected} height={320} /> : null}
            {list.map((c) => {
              const on = selected === c.id;
              const hasPos = c.latitude != null && c.longitude != null;
              return (
                <Card key={c.id} onPress={() => setSelected(c.id)} style={on ? { borderColor: colors.primary, borderWidth: 2 } : undefined} accessibilityLabel={`${c.name}, ${c.city}`}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: on ? colors.lime : colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="business" size={22} color={on ? 'ink' : 'primary'} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text variant="subheading">{c.name}</Text>
                      <Text variant="caption" color="textMuted">{[c.address_line1, c.address_line2, `${c.postcode} ${c.city}`, c.state].filter(Boolean).join(', ')}</Text>
                      {c.phone ? <Text variant="caption" color="textSubtle">{c.phone}</Text> : null}
                      {Object.keys(c.opening_hours ?? {}).length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                          {Object.entries(c.opening_hours).map(([d, h]) => <Badge key={d} label={`${d}: ${h}`} icon="time-outline" />)}
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                    {hasPos ? <Button label="Directions" icon="navigate" variant="secondary" size="md" fullWidth={false} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`)} /> : null}
                    {c.phone ? <Button label="Call" icon="call" variant="outline" size="md" fullWidth={false} onPress={() => Linking.openURL(`tel:${c.phone}`)} /> : null}
                    <Button label="Book here" icon="calendar" size="md" fullWidth={false} onPress={() => router.push({ pathname: '/book', params: { type: 'clinic' } })} />
                  </View>
                </Card>
              );
            })}
            <Text variant="caption" color="textSubtle" align="center">Map data © OpenStreetMap contributors © CARTO</Text>
          </>
        )}
      </View>
    </Screen>
  );
}

import React from 'react';
import { Switch, View } from 'react-native';
import { formatDuration, friendlyError } from '@bevital/shared';
import { useCategories } from '@/api/catalog';
import { useMyOfferedServices } from '@/api/therapist';
import { Banner, Card, ErrorState, LoadingList, Screen, SectionHeader, Text, useToast } from '@/components/ui';
import { colors } from '@/theme';

/** Choose which catalogue services you deliver. Only these are offered to patients when you're available. */
export default function MyServices() {
  const toast = useToast();
  const categories = useCategories();
  const q = useMyOfferedServices();
  const byCat = new Map<string, NonNullable<typeof q.data>['all']>();
  for (const s of q.data?.all ?? []) byCat.set(s.category_id, [...(byCat.get(s.category_id) ?? []), s]);

  return (
    <Screen title="Services I offer">
      <Banner tone="info" icon="medkit-outline" title="Only offer what you're qualified to deliver" body="Patients can book you for the services you switch on." />
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (categories.data ?? []).map((c) => (
        <View key={c.id}>
          <SectionHeader title={c.name} />
          <Card padding={4} style={{ paddingHorizontal: 16 }}>
            {(byCat.get(c.id) ?? []).map((s, i, arr) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{s.name}</Text>
                  <Text variant="caption" color="textMuted">{formatDuration(s.duration_minutes)} · {[s.supports_clinic ? 'Clinic' : null, s.supports_home ? 'Home' : null].filter(Boolean).join(' & ')}</Text>
                </View>
                <Switch value={q.data!.offered.has(s.id)} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface}
                  onValueChange={(on) => q.toggle.mutate({ serviceId: s.id, on }, { onError: (e) => toast.show(friendlyError(e), 'error') })} accessibilityLabel={`Offer ${s.name}`} />
              </View>
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

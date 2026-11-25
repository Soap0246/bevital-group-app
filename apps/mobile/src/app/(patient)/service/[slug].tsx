import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatDuration, formatMYR } from '@bevital/shared';
import { useCategories, useService, useTherapistsForService } from '@/api/catalog';
import { TherapistCard } from '@/components/domain/cards';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, LoadingList, Screen, SectionHeader, Text } from '@/components/ui';
import { colors } from '@/theme';

export default function ServiceDetail() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const service = useService(slug);
  const categories = useCategories();
  const therapists = useTherapistsForService(service.data?.id);
  const s = service.data;
  const category = (categories.data ?? []).find((c) => c.id === s?.category_id);

  if (service.isLoading) return <Screen title="Service"><LoadingList /></Screen>;
  if (service.isError) return <Screen title="Service"><ErrorState error={service.error} onRetry={() => service.refetch()} /></Screen>;
  if (!s) return <Screen title="Service"><EmptyState icon="alert-circle-outline" title="Service not found" /></Screen>;

  return (
    <Screen title={category?.name ?? 'Service'} footer={<Button label="Book this service" icon="calendar" onPress={() => router.push({ pathname: '/book', params: { serviceId: s.id } })} />}>
      <Text variant="display" style={{ marginTop: 4 }}>{s.name}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12, flexWrap: 'wrap' }}>
        <Badge label={formatDuration(s.duration_minutes)} icon="time-outline" />
        {s.supports_clinic ? <Badge label="Clinic" tone="primary" icon="business-outline" /> : null}
        {s.supports_home ? <Badge label="Home visit" tone="info" icon="home-outline" /> : null}
      </View>
      <Text color="inkSoft">{s.description}</Text>

      <Card tone="tinted" style={{ marginTop: 20 }}>
        <Text variant="label" color="textMuted">PRICING</Text>
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 8 }}>
          {s.supports_clinic ? <View><Text variant="caption" color="textMuted">At clinic</Text><Text variant="title" color="primaryDark">{formatMYR(s.price_clinic)}</Text></View> : null}
          {s.supports_home ? <View><Text variant="caption" color="textMuted">At home</Text><Text variant="title" color="primaryDark">{formatMYR(s.price_home)}</Text></View> : null}
        </View>
        {s.supports_home ? <Text variant="caption" color="textMuted" style={{ marginTop: 8 }}>Home visits may include a travel fee based on distance.</Text> : null}
      </Card>

      <SectionHeader title="Conditions treated" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {s.conditions_treated.map((c) => <Badge key={c} label={c} tone="neutral" />)}
      </View>

      <SectionHeader title="Treatment objectives" />
      <View style={{ gap: 10 }}>
        {s.treatment_objectives.map((o) => (
          <View key={o} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="checkmark-circle" size={22} color="success" />
            <Text style={{ flex: 1 }}>{o}</Text>
          </View>
        ))}
      </View>

      <SectionHeader title="Available physiotherapists" />
      {therapists.isLoading ? <LoadingList count={2} /> : (therapists.data ?? []).length === 0 ? (
        <Card><Text color="textMuted">No verified physiotherapist currently offers this service. Check back soon.</Text></Card>
      ) : (
        <View style={{ gap: 12 }}>
          {(therapists.data ?? []).map((t) => <TherapistCard key={t.id} therapist={t} compact onPress={() => router.push({ pathname: '/therapist/[id]', params: { id: t.id } })} />)}
        </View>
      )}
      <View style={{ height: 8, backgroundColor: colors.background }} />
    </Screen>
  );
}

import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useDiscoverTherapists } from '@/api/catalog';
import { TherapistCard } from '@/components/domain/cards';
import { EmptyState, ErrorState, LoadingList, Screen } from '@/components/ui';

/** All verified, bookable physiotherapists. */
export default function Physios() {
  const router = useRouter();
  const list = useDiscoverTherapists();
  return (
    <Screen title="Our physiotherapists" subtitle="Verified and ready to book" refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <View style={{ gap: 12, marginTop: 8 }}>
        {list.isLoading ? <LoadingList /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (list.data ?? []).length === 0 ? (
          <EmptyState icon="people-outline" title="No physiotherapists yet" body="Verified physiotherapists will appear here as they join BeVital." />
        ) : (list.data ?? []).map((t) => (
          <TherapistCard key={t.id} therapist={t} onPress={() => router.push({ pathname: '/therapist/[id]', params: { id: t.id } })} />
        ))}
      </View>
    </Screen>
  );
}

import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { formatMYR } from '@bevital/shared';
import { useEarnings } from '@/api/therapist';
import { BarChart } from '@/components/charts/charts';
import { BrandHeader } from '@/components/domain/TherapistHeader';
import { Banner, Card, ErrorState, LoadingList, Screen, SectionHeader, Text } from '@/components/ui';

export default function Earnings() {
  const q = useEarnings();
  const { width } = useWindowDimensions();
  const e = q.data;
  const months = (e?.by_month ?? []).map((m) => ({ label: m.month.slice(5), value: Math.round(Number(m.earned)) }));
  return (
    <Screen header={<BrandHeader />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <Text variant="title" style={{ marginTop: 8, marginBottom: 12 }}>Earnings</Text>
      {q.isLoading ? <LoadingList /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : e ? (
        <View style={{ gap: 12 }}>
          <Card tone="dark" style={{ padding: 20 }}>
            <Text variant="label" color="primaryMuted">THIS MONTH</Text>
            <Text variant="display" color="surface">{formatMYR(e.this_month)}</Text>
            <Text variant="caption" color="primaryMuted">{e.completed_sessions} sessions completed in total</Text>
          </Card>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1 }}><Text variant="caption" color="textMuted">Total earned</Text><Text variant="title" color="primaryDark">{formatMYR(e.total_earned)}</Text></Card>
            <Card style={{ flex: 1 }}><Text variant="caption" color="textMuted">Upcoming ({e.upcoming_sessions})</Text><Text variant="title" color="primaryDark">{formatMYR(e.upcoming_estimate)}</Text></Card>
          </View>
          <SectionHeader title="Last 6 months" />
          <Card>{months.length ? <BarChart data={months} width={Math.min(width - 72, 460)} ariaLabel="Earnings per month in ringgit" /> : <Text color="textMuted">Your monthly earnings chart appears after your first completed session.</Text>}</Card>
          <Banner tone="info" icon="information-circle-outline" title="How earnings are calculated" body="Per completed session: service fee plus travel fee, less BeVital's platform commission. Upcoming figures are estimates for confirmed sessions. Payouts to your bank account are not connected in this version." />
        </View>
      ) : null}
    </Screen>
  );
}

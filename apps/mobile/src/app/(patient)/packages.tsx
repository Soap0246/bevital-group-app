import React, { useState } from 'react';
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { formatDate, formatMYR, friendlyError, type PackageRow, type PaymentMethod } from '@bevital/shared';
import { startCheckout } from '@/api/bookings';
import { useFeaturedPromotions } from '@/api/catalog';
import { useMyPackages, usePackages } from '@/api/profile';
import { PaymentMethodList } from '@/components/domain/PaymentMethods';
import { PromoCard } from '@/components/domain/cards';
import { Badge, Banner, Button, Card, EmptyState, LoadingList, Screen, ScrollRow, SectionHeader, Sheet, Text, useToast } from '@/components/ui';
import { useQueryClient } from '@tanstack/react-query';
import { colors } from '@/theme';

export default function Packages() {
  const toast = useToast();
  const qc = useQueryClient();
  const packages = usePackages();
  const mine = useMyPackages();
  const promos = useFeaturedPromotions();
  const [buying, setBuying] = useState<PackageRow | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('fpx');
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);

  const buy = async () => {
    if (!buying) return;
    setBusy(true);
    try {
      const r = await startCheckout({ packageId: buying.id, method });
      if (!r.providerConfigured) { setNotConfigured(true); return; }
      if (r.checkoutUrl) await WebBrowser.openBrowserAsync(r.checkoutUrl);
      setBuying(null);
      await qc.invalidateQueries({ queryKey: ['my-packages'] });
      toast.show('We will activate your package as soon as payment is verified.', 'info');
    } catch (e) { toast.show(friendlyError(e), 'error'); } finally { setBusy(false); }
  };

  const active = (mine.data ?? []).filter((p) => p.status === 'active' || p.status === 'exhausted' || p.status === 'expired');

  return (
    <Screen title="Packages & vouchers" refreshing={mine.isRefetching} onRefresh={() => { void mine.refetch(); void packages.refetch(); }}>
      {active.length > 0 ? (
        <>
          <SectionHeader title="My packages" />
          <View style={{ gap: 12 }}>
            {active.map((p) => {
              const used = p.sessions_total - p.sessions_remaining;
              return (
                <Card key={p.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text variant="subheading" style={{ flex: 1 }}>{p.package?.name ?? 'Package'}</Text>
                    <Badge label={p.status} tone={p.status === 'active' ? 'success' : 'neutral'} />
                  </View>
                  <Text variant="title" color="primaryDark" style={{ marginTop: 6 }}>{p.sessions_remaining} <Text color="textMuted" variant="body">of {p.sessions_total} sessions left</Text></Text>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primaryLight, marginTop: 8, overflow: 'hidden' }}>
                    <View style={{ width: `${(used / p.sessions_total) * 100}%`, height: 8, backgroundColor: colors.primary }} />
                  </View>
                  {p.expires_at ? <Text variant="caption" color="textMuted" style={{ marginTop: 8 }}>Valid until {formatDate(p.expires_at)}</Text> : null}
                </Card>
              );
            })}
          </View>
        </>
      ) : null}

      <SectionHeader title="Multi-session packages" />
      {packages.isLoading ? <LoadingList count={2} /> : (packages.data ?? []).length === 0 ? (
        <EmptyState icon="ticket-outline" title="No packages available" body="Check back soon for session bundles and savings." />
      ) : (
        <View style={{ gap: 12 }}>
          {(packages.data ?? []).map((p) => (
            <Card key={p.id}>
              <Text variant="subheading">{p.name}</Text>
              {p.description ? <Text variant="caption" color="textMuted" style={{ marginTop: 4 }}>{p.description}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <View>
                  <Text variant="title" color="primaryDark">{formatMYR(p.price)}</Text>
                  <Text variant="caption" color="textMuted">{p.session_count} sessions · {formatMYR(Number(p.price) / p.session_count)} each · {p.validity_days} days</Text>
                </View>
                <Button label="Buy" size="md" fullWidth={false} onPress={() => { setNotConfigured(false); setBuying(p); }} />
              </View>
            </Card>
          ))}
        </View>
      )}

      {(promos.data ?? []).length > 0 ? (
        <>
          <SectionHeader title="Vouchers & promotions" />
          <ScrollRow>{(promos.data ?? []).map((p) => <PromoCard key={p.id} promo={p} />)}</ScrollRow>
          <Text variant="caption" color="textMuted" style={{ marginTop: 8 }}>Enter a code on the review step when you book. A package session can't be combined with a promo code.</Text>
        </>
      ) : null}

      <Sheet visible={!!buying} onClose={() => setBuying(null)} title={buying?.name} footer={notConfigured ? undefined : <Button label={`Pay ${formatMYR(buying?.price)}`} icon="lock-closed" loading={busy} onPress={buy} />}>
        {notConfigured ? (
          <Banner tone="warning" icon="construct-outline" title="Online payments aren't switched on yet" body="No charge was made. Packages can be bought once BeVital connects its payment provider." />
        ) : (
          <>
            <Text color="textMuted">Sessions are added to your account only after payment is verified.</Text>
            <PaymentMethodList value={method} onChange={setMethod} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useArticles, useCategories, useServices } from '@/api/catalog';
import { ServiceCard } from '@/components/domain/cards';
import { colors } from '@/theme';
import { ArticleCard } from '@/components/domain/cards';
import { Chip, ChipRow, EmptyState, ErrorState, LoadingList, Logo, Row, Screen, ScrollRow, SearchBar, Segmented, Text } from '@/components/ui';

/** Marketplace: all services come from the database (categories → services). */
export default function Services() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const categories = useCategories();
  const services = useServices();
  const articles = useArticles();
  const [q, setQ] = useState(params.q ?? '');
  const [cat, setCat] = useState<string | null>(null);
  const [type, setType] = useState<'all' | 'clinic' | 'home'>('all');

  useEffect(() => { if (params.q !== undefined) setQ(params.q); }, [params.q]);
  useEffect(() => {
    if (params.category && categories.data) setCat(categories.data.find((c) => c.slug === params.category)?.id ?? null);
  }, [params.category, categories.data]);

  const catById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data]);
  const list = useMemo(() => (services.data ?? []).filter((s) => {
    if (cat && s.category_id !== cat) return false;
    if (type === 'clinic' && !s.supports_clinic) return false;
    if (type === 'home' && !s.supports_home) return false;
    const t = q.trim().toLowerCase();
    return !t || [s.name, s.description, ...s.conditions_treated, catById.get(s.category_id)?.name ?? ''].join(' ').toLowerCase().includes(t);
  }), [services.data, cat, type, q, catById]);

  return (
    <Screen
      header={<View style={{ paddingHorizontal: 20, paddingTop: 10 }}><Logo variant="nolb" height={40} /></View>}
      refreshing={services.isRefetching}
      onRefresh={() => { void services.refetch(); void categories.refetch(); }}
    >
      <Text variant="title" style={{ marginTop: 12, marginBottom: 12 }}>Physiotherapy services</Text>
      <SearchBar value={q} onChangeText={setQ} placeholder="Search a condition or service" />
      <View style={{ height: 12 }} />
      <ChipRow>
        <Chip label="All" selected={cat === null} onPress={() => setCat(null)} />
        {(categories.data ?? []).map((c) => <Chip key={c.id} label={c.name.replace(' Physiotherapy', '')} selected={cat === c.id} onPress={() => setCat(c.id)} />)}
      </ChipRow>
      <View style={{ height: 12 }} />
      <Segmented value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, { value: 'clinic', label: 'Clinic', icon: 'business-outline' }, { value: 'home', label: 'Home', icon: 'home-outline' }]} />
      <View style={{ gap: 12, marginTop: 16 }}>
        {services.isLoading ? <LoadingList /> : services.isError ? <ErrorState error={services.error} onRetry={() => services.refetch()} /> : list.length === 0 ? (
          <EmptyState icon="search-outline" title="No services found" body="Try a different search or filter." actionLabel="Clear filters" onAction={() => { setQ(''); setCat(null); setType('all'); }} />
        ) : list.map((s) => (
          <ServiceCard key={s.id} service={s} category={catById.get(s.category_id)} onPress={() => router.push({ pathname: '/service/[slug]', params: { slug: s.slug } })} />
        ))}
      </View>

      <Text variant="heading" style={{ marginTop: 32, marginBottom: 4 }} accessibilityRole="header">More from BeVital</Text>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16 }}>
        <Row icon="map-outline" title="Find a clinic" subtitle="Map, opening hours and directions" onPress={() => router.push('/clinics')} />
        <Row icon="people-outline" title="Our physiotherapists" subtitle="Verified and ready to book" onPress={() => router.push('/physios')} />
        <Row icon="ticket-outline" title="Packages" subtitle="Save with multi-session bundles" onPress={() => router.push('/packages')} last />
      </View>
      {(articles.data ?? []).length > 0 ? (
        <>
          <Text variant="heading" style={{ marginTop: 28, marginBottom: 12 }} accessibilityRole="header">Health tips</Text>
          <ScrollRow>
            {(articles.data ?? []).map((a) => <ArticleCard key={a.id} article={a} onPress={() => router.push({ pathname: '/article/[slug]', params: { slug: a.slug } })} />)}
          </ScrollRow>
        </>
      ) : null}
    </Screen>
  );
}

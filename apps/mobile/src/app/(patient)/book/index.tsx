import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories, useServices, useTherapist } from '@/api/catalog';
import { BookStep } from '@/components/domain/BookStep';
import { ServiceCard } from '@/components/domain/cards';
import { Banner, ChipRow, Chip, EmptyState, LoadingList, SearchBar } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';

/** Step 1 — choose a service. Accepts ?serviceId, ?type and ?therapistId from other screens. */
export default function SelectService() {
  const router = useRouter();
  const { serviceId, type, therapistId } = useLocalSearchParams<{ serviceId?: string; type?: string; therapistId?: string }>();
  const { draft, update, reset } = useBookingDraft();
  const services = useServices();
  const categories = useCategories();
  const therapist = useTherapist(therapistId);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);

  // Fresh draft per entry; optional deep-link presets.
  useEffect(() => {
    reset({
      type: type === 'home' || type === 'clinic' ? type : null,
      preferredTherapistId: therapistId ?? null,
    });
    // run once on entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const offered = useMemo(() => {
    const ids = therapistId ? new Set((therapist.data?.services ?? []).map((s) => s.id)) : null;
    return (services.data ?? []).filter((s) => {
      if (ids && !ids.has(s.id)) return false;
      if (cat && s.category_id !== cat) return false;
      if (draft.type === 'home' && !s.supports_home) return false;
      if (draft.type === 'clinic' && !s.supports_clinic) return false;
      const t = q.trim().toLowerCase();
      return !t || [s.name, s.description, ...s.conditions_treated].join(' ').toLowerCase().includes(t);
    });
  }, [services.data, therapist.data, therapistId, cat, q, draft.type]);

  // Preselected service from a service page → skip ahead.
  useEffect(() => {
    if (!serviceId || !services.data) return;
    const s = services.data.find((x) => x.id === serviceId);
    if (s) {
      update({ service: s });
      router.replace('/book/type');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, services.data]);

  const catById = new Map((categories.data ?? []).map((c) => [c.id, c]));

  return (
    <BookStep step={1} title="Choose a service">
      {therapistId && therapist.data ? <Banner tone="info" icon="person-outline" title={`Booking with ${therapist.data.profile.display_name}`} body="Showing the services this physiotherapist offers." /> : null}
      <SearchBar value={q} onChangeText={setQ} placeholder="Search condition or service" />
      <ChipRow>
        <Chip label="All" selected={cat === null} onPress={() => setCat(null)} />
        {(categories.data ?? []).map((c) => <Chip key={c.id} label={c.name.replace(' Physiotherapy', '')} selected={cat === c.id} onPress={() => setCat(c.id)} />)}
      </ChipRow>
      {services.isLoading ? <LoadingList /> : offered.length === 0 ? (
        <EmptyState icon="search-outline" title="No matching services" body="Try a different search or category." />
      ) : (
        <View style={{ gap: 12 }}>
          {offered.map((s) => (
            <ServiceCard key={s.id} service={s} category={catById.get(s.category_id)} onPress={() => { update({ service: s }); router.push('/book/type'); }} />
          ))}
        </View>
      )}
    </BookStep>
  );
}

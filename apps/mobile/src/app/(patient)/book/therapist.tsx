import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAvailableTherapists } from '@/api/catalog';
import { BookStep } from '@/components/domain/BookStep';
import { TherapistCardFromSearch } from '@/components/domain/cards';
import { Card, EmptyState, ErrorState, Icon, LoadingList, Text, Button } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { colors } from '@/theme';

/** Steps 5–6 — see who is available for this exact slot, then choose a therapist or let BeVital match you. */
export default function SelectTherapist() {
  const router = useRouter();
  const { draft, update } = useBookingDraft();
  const { service, type, startAt } = draft;

  const query = useMemo(
    () => (service && type && startAt ? {
      serviceId: service.id, type, startAt,
      clinicId: type === 'clinic' ? draft.clinicId : null,
      lat: type === 'home' ? draft.address?.latitude : null, lng: type === 'home' ? draft.address?.longitude : null,
    } : null),
    [service, type, startAt, draft.clinicId, draft.address],
  );
  const list = useAvailableTherapists(query);

  // Pre-select the therapist the patient came from, if they are actually available.
  useEffect(() => {
    if (draft.preferredTherapistId && !draft.therapist && list.data) {
      const t = list.data.find((x) => x.therapist_id === draft.preferredTherapistId);
      if (t) update({ therapist: { id: t.therapist_id, name: t.display_name } });
    }
  }, [list.data, draft.preferredTherapistId, draft.therapist, update]);

  if (!service || !type || !startAt) { router.replace('/book'); return null; }
  const auto = draft.therapist === null;

  return (
    <BookStep step={5} title="Choose your physiotherapist" footer={<Button label="Continue" onPress={() => router.push('/book/review')} disabled={(list.data ?? []).length === 0} />}>
      <Card onPress={() => update({ therapist: null })} style={auto ? { borderColor: colors.primary, borderWidth: 2 } : undefined} tone={auto ? 'tinted' : 'default'} accessibilityLabel="Automatic matching, recommended">
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="flash" size={24} color="primary" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="subheading">Match me automatically</Text>
            <Text variant="caption" color="textMuted">We'll assign the best available physiotherapist{type === 'home' ? ' — nearest first' : ' — highest rated first'}.</Text>
          </View>
          {auto ? <Icon name="checkmark-circle" size={26} color="primary" /> : null}
        </View>
      </Card>

      <Text variant="subheading" style={{ marginTop: 4 }}>Or choose from {list.data?.length ?? '…'} available</Text>
      {list.isLoading ? <LoadingList count={2} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (list.data ?? []).length === 0 ? (
        <EmptyState icon="people-outline" title="No one is free at this time" body="Someone may have just booked it. Go back and choose another time." actionLabel="Choose another time" onAction={() => router.back()} />
      ) : (
        (list.data ?? []).map((t) => (
          <TherapistCardFromSearch key={t.therapist_id} t={t} selected={draft.therapist?.id === t.therapist_id} onPress={() => update({ therapist: { id: t.therapist_id, name: t.display_name } })} />
        ))
      )}
      {draft.therapist ? <Button label={`View ${draft.therapist.name}'s profile`} variant="ghost" onPress={() => router.push({ pathname: '/therapist/[id]', params: { id: draft.therapist!.id } })} /> : null}
    </BookStep>
  );
}

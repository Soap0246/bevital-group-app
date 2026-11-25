import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { friendlyError } from '@bevital/shared';
import { useMyBase, useSetServiceBase, useUpdateTherapistProfile } from '@/api/therapist';
import { LocationPicker } from '@/components/map/LocationPicker';
import { Banner, Button, Card, Chip, ChipRow, Screen, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

/** Clinic / home-visit settings. The base location is private — it is only used to calculate distance and fees. */
export default function ServiceArea() {
  const toast = useToast();
  const { therapist } = useAuth();
  const update = useUpdateTherapistProfile();
  const base = useMyBase();
  const setBase = useSetServiceBase();
  const [picking, setPicking] = useState(false);

  const patch = (p: Record<string, unknown>) => update.mutate(p, { onError: (e) => toast.show(friendlyError(e), 'error') });

  if (picking) {
    return (
      <Screen title="Set your base location" scroll={false} padded={false}>
        <LocationPicker
          initial={base.data?.base_latitude != null ? { latitude: Number(base.data.base_latitude), longitude: Number(base.data.base_longitude) } : null}
          confirmLabel="Use as my base"
          onConfirm={async (p) => {
            try { await setBase.mutateAsync({ latitude: p.latitude, longitude: p.longitude }); await base.refetch(); setPicking(false); toast.show('Base location saved'); }
            catch (e) { toast.show(friendlyError(e), 'error'); }
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Home-visit area">
      <View style={{ gap: 14, marginTop: 8 }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}><Text variant="bodyStrong">Offer clinic appointments</Text><Text variant="caption" color="textMuted">{therapist?.clinic_id ? 'At your BeVital clinic' : 'You need a clinic assigned by BeVital to take clinic bookings'}</Text></View>
            <Switch value={therapist?.offers_clinic_visits ?? false} onValueChange={(v) => patch({ offers_clinic_visits: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} accessibilityLabel="Offer clinic appointments" />
          </View>
        </Card>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}><Text variant="bodyStrong">Offer home visits</Text><Text variant="caption" color="textMuted">Patients near your base can book you at home</Text></View>
            <Switch value={therapist?.offers_home_visits ?? false} onValueChange={(v) => patch({ offers_home_visits: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} accessibilityLabel="Offer home visits" />
          </View>
        </Card>
        {therapist?.offers_home_visits ? (
          <>
            <Text variant="subheading">Maximum travel distance</Text>
            <ChipRow>{[5, 10, 15, 20, 30, 50].map((km) => <Chip key={km} label={`${km} km`} selected={Number(therapist.service_radius_km) === km} onPress={() => patch({ service_radius_km: km })} />)}</ChipRow>
            <Card>
              <Text variant="bodyStrong">Base location</Text>
              <Text color="textMuted" style={{ marginBottom: 10 }}>{base.data?.base_latitude != null ? `${Number(base.data.base_latitude).toFixed(4)}, ${Number(base.data.base_longitude).toFixed(4)}` : 'Not set — home bookings are unavailable until you set it.'}</Text>
              <Button label={base.data?.base_latitude != null ? 'Change base location' : 'Set base location'} icon="locate" variant="secondary" onPress={() => setPicking(true)} />
            </Card>
            <Banner tone="info" icon="lock-closed-outline" title="Your base stays private" body="Patients never see your base location, only the estimated distance and travel fee for their own address." />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

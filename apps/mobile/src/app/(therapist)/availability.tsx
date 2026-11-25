import React, { useState } from 'react';
import { View } from 'react-native';
import { WEEKDAY_NAMES, availabilityWindowSchema, formatClock, formatDateTime, friendlyError, toKlDateString } from '@bevital/shared';
import { useAvailabilityMutations, useMyAvailability } from '@/api/therapist';
import { Banner, Button, Card, Chip, ChipRow, EmptyState, Input, LoadingList, Row, Screen, SectionHeader, Sheet, Text, useToast } from '@/components/ui';

/** Weekly working hours (the source of all patient-facing availability) and one-off time off. */
export default function Availability() {
  const toast = useToast();
  const q = useMyAvailability();
  const m = useAvailabilityMutations();
  const [win, setWin] = useState<{ day: number; start: string; end: string; loc: 'clinic' | 'home' | 'both' } | null>(null);
  const [off, setOff] = useState<{ from: string; to: string; reason: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const addWindow = async () => {
    if (!win) return;
    const parsed = availabilityWindowSchema.safeParse({ dayOfWeek: win.day, startTime: win.start, endTime: win.end, locationType: win.loc });
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Check the times'); return; }
    try { await m.add.mutateAsync({ day_of_week: win.day, start_time: win.start, end_time: win.end, location_type: win.loc }); setWin(null); setErr(null); toast.show('Hours added'); }
    catch (e) { setErr(friendlyError(e)); }
  };

  const addOff = async () => {
    if (!off) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(off.from) || !/^\d{4}-\d{2}-\d{2}$/.test(off.to) || off.to < off.from) { setErr('Use YYYY-MM-DD dates; the end date cannot be before the start'); return; }
    try {
      await m.addTimeOff.mutateAsync({ starts_at: `${off.from}T00:00:00+08:00`, ends_at: `${off.to}T23:59:59+08:00`, reason: off.reason || undefined });
      setOff(null); setErr(null); toast.show('Time off added');
    } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <Screen title="Working hours" subtitle="Patients can only book inside these hours">
      <Banner tone="info" icon="information-circle-outline" title="Real availability" body="Patients see exactly the free time left in these hours, after your existing bookings and a travel buffer for home visits." />
      {q.isLoading ? <LoadingList /> : (
        <>
          {WEEKDAY_NAMES.map((name, i) => {
            const day = i + 1;
            const windows = (q.data?.windows ?? []).filter((w) => w.day_of_week === day);
            return (
              <Card key={name} style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="subheading">{name}</Text>
                  <Button label="Add hours" variant="secondary" size="md" fullWidth={false} icon="add" onPress={() => { setErr(null); setWin({ day, start: '09:00', end: '17:00', loc: 'both' }); }} />
                </View>
                {windows.length === 0 ? <Text color="textMuted" style={{ marginTop: 6 }}>Not working</Text> : windows.map((w, idx) => (
                  <Row key={w.id} icon="time-outline" title={`${formatClock(w.start_time)} – ${formatClock(w.end_time)}`} subtitle={w.location_type === 'both' ? 'Clinic & home visits' : w.location_type === 'clinic' ? 'Clinic only' : 'Home visits only'}
                    right={<Button label="Remove" variant="ghost" size="md" fullWidth={false} onPress={() => m.remove.mutate(w.id, { onError: (e) => toast.show(friendlyError(e), 'error') })} />} last={idx === windows.length - 1} />
                ))}
              </Card>
            );
          })}

          <SectionHeader title="Time off" action="Add" onAction={() => { setErr(null); setOff({ from: toKlDateString(), to: toKlDateString(), reason: '' }); }} />
          {(q.data?.timeOff ?? []).length === 0 ? <EmptyState icon="airplane-outline" title="No time off scheduled" body="Block leave or holidays so patients can't book them." /> : (q.data?.timeOff ?? []).map((t) => (
            <Card key={t.id} style={{ marginBottom: 10 }}>
              <Row icon="airplane-outline" title={`${formatDateTime(t.starts_at)} → ${formatDateTime(t.ends_at)}`} subtitle={t.reason ?? undefined}
                right={<Button label="Remove" variant="ghost" size="md" fullWidth={false} onPress={() => m.removeTimeOff.mutate(t.id)} />} last />
            </Card>
          ))}
        </>
      )}

      <Sheet visible={!!win} onClose={() => setWin(null)} title={win ? `Add hours · ${WEEKDAY_NAMES[win.day - 1]}` : ''} footer={<Button label="Save hours" loading={m.add.isPending} onPress={addWindow} />}>
        {err ? <Text color="danger">{err}</Text> : null}
        {win ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Input label="From (24h)" value={win.start} onChangeText={(t) => setWin({ ...win, start: t })} placeholder="09:00" keyboardType="numbers-and-punctuation" /></View>
              <View style={{ flex: 1 }}><Input label="To (24h)" value={win.end} onChangeText={(t) => setWin({ ...win, end: t })} placeholder="17:00" keyboardType="numbers-and-punctuation" /></View>
            </View>
            <Text variant="label" color="inkSoft">WHERE</Text>
            <ChipRow>
              {([['both', 'Clinic & home'], ['clinic', 'Clinic only'], ['home', 'Home visits only']] as const).map(([v, l]) => <Chip key={v} label={l} selected={win.loc === v} onPress={() => setWin({ ...win, loc: v })} />)}
            </ChipRow>
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!off} onClose={() => setOff(null)} title="Add time off" footer={<Button label="Save" loading={m.addTimeOff.isPending} onPress={addOff} />}>
        {err ? <Text color="danger">{err}</Text> : null}
        {off ? (
          <>
            <Input label="First day off" value={off.from} onChangeText={(t) => setOff({ ...off, from: t })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
            <Input label="Last day off" value={off.to} onChangeText={(t) => setOff({ ...off, to: t })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
            <Input label="Reason (private)" value={off.reason} onChangeText={(t) => setOff({ ...off, reason: t })} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

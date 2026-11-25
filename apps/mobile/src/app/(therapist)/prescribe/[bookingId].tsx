import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { friendlyError } from '@bevital/shared';
import { useCreateProgramme, useTherapistBooking } from '@/api/therapist';
import { Banner, Button, Card, Icon, Input, LoadingList, Screen, Text, useToast } from '@/components/ui';

interface Draft { name: string; sets: string; reps: string; hold: string; instructions: string; video: string }
const blank = (): Draft => ({ name: '', sets: '', reps: '', hold: '', instructions: '', video: '' });

/** Build a home exercise programme for the patient (items appear in their My Recovery tab). */
export default function Prescribe() {
  const router = useRouter();
  const toast = useToast();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const q = useTherapistBooking(bookingId);
  const create = useCreateProgramme();
  const [title, setTitle] = useState('');
  const [freq, setFreq] = useState('3');
  const [items, setItems] = useState<Draft[]>([blank()]);
  const [err, setErr] = useState<string | null>(null);
  const b = q.data;

  const patch = (i: number, p: Partial<Draft>) => setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...p } : it)));

  const submit = async () => {
    if (!b) return;
    setErr(null);
    const valid = items.filter((i) => i.name.trim());
    if (title.trim().length < 3) { setErr('Give the programme a title'); return; }
    if (valid.length === 0) { setErr('Add at least one exercise'); return; }
    const f = Number(freq);
    if (!Number.isInteger(f) || f < 1 || f > 14) { setErr('Frequency must be 1–14 times per week'); return; }
    for (const v of valid) if (v.video && !/^https:\/\//i.test(v.video)) { setErr(`Video link for "${v.name}" must start with https://`); return; }
    try {
      await create.mutateAsync({
        booking: b, title: title.trim(), frequency: f,
        items: valid.map((v) => ({ name: v.name.trim(), sets: v.sets ? Number(v.sets) : null, reps: v.reps ? Number(v.reps) : null, hold_seconds: v.hold ? Number(v.hold) : null, instructions: v.instructions, video_url: v.video })),
      });
      toast.show('Programme sent to the patient'); router.back();
    } catch (e) { setErr(friendlyError(e)); }
  };

  if (q.isLoading) return <Screen title="Prescribe exercises"><LoadingList count={1} /></Screen>;

  return (
    <Screen title="Prescribe exercises" subtitle={b?.family?.full_name ?? b?.patient?.full_name} footer={<Button label="Send to patient" icon="send" loading={create.isPending} onPress={submit} />}>
      {err ? <Banner tone="danger" icon="alert-circle" title={err} /> : null}
      <View style={{ gap: 14, marginTop: 8 }}>
        <Input label="Programme title" value={title} onChangeText={setTitle} placeholder="e.g. Lower back mobility — weeks 1–2" />
        <Input label="Times per week" value={freq} onChangeText={setFreq} keyboardType="number-pad" />
        {items.map((it, i) => (
          <Card key={i} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="subheading">Exercise {i + 1}</Text>
              {items.length > 1 ? <Button label="Remove" variant="ghost" size="md" fullWidth={false} onPress={() => setItems((c) => c.filter((_, idx) => idx !== i))} /> : null}
            </View>
            <Input label="Name" value={it.name} onChangeText={(t) => patch(i, { name: t })} placeholder="e.g. Cat-camel stretch" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Input label="Sets" value={it.sets} onChangeText={(t) => patch(i, { sets: t })} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Input label="Reps" value={it.reps} onChangeText={(t) => patch(i, { reps: t })} keyboardType="number-pad" /></View>
              <View style={{ flex: 1 }}><Input label="Hold (s)" value={it.hold} onChangeText={(t) => patch(i, { hold: t })} keyboardType="number-pad" /></View>
            </View>
            <Input label="Instructions" multiline value={it.instructions} onChangeText={(t) => patch(i, { instructions: t })} placeholder="How to perform it safely" />
            <Input label="Demonstration video link (https)" value={it.video} onChangeText={(t) => patch(i, { video: t })} autoCapitalize="none" keyboardType="url" icon="videocam-outline" placeholder="https://…" />
          </Card>
        ))}
        <Button label="Add another exercise" variant="secondary" icon="add" onPress={() => setItems((c) => [...c, blank()])} />
        <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="information-circle-outline" size={20} color="info" /><Text variant="caption" color="textMuted" style={{ flex: 1 }}>Patients see this in My Recovery and can log each exercise, with an optional pain score.</Text></View>
      </View>
    </Screen>
  );
}

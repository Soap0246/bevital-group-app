import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatDate, friendlyError, type ExerciseCompletionRow, type ExerciseItemRow, type ExerciseProgrammeRow } from '@bevital/shared';
import { unwrap } from '@/api/catalog';
import { adherence, streakDays } from '@/api/recovery';
import { useGoals, useNotesForPatient, useSaveGoal, useTherapistBookings } from '@/api/therapist';
import { Badge, Button, Card, EmptyState, Input, LoadingList, Row, Screen, SectionHeader, Sheet, StatusBadge, Text, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type Prog = ExerciseProgrammeRow & { items: ExerciseItemRow[] };

/** One patient (or family member) across all of this therapist's appointments with them. */
export default function Client() {
  const router = useRouter();
  const toast = useToast();
  const { key } = useLocalSearchParams<{ key: string }>();
  const [userId, fam] = decodeURIComponent(key ?? '').split('|');
  const familyId = fam && fam !== 'self' ? fam : null;
  const bookings = useTherapistBookings();
  const goals = useGoals(userId, familyId);
  const notes = useNotesForPatient(userId, familyId);
  const saveGoal = useSaveGoal();
  const [goalSheet, setGoalSheet] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');

  const mine = (bookings.data ?? []).filter((b) => b.patient_user_id === userId && (b.family_member_id ?? null) === familyId);
  const first = mine[0];
  const name = first ? (first.family?.full_name ?? first.patient?.full_name ?? 'Patient') : 'Patient';

  const progs = useQuery({
    queryKey: ['client-programmes', userId, familyId],
    enabled: !!userId,
    queryFn: async () => {
      let q = supabase.from('exercise_programmes').select('*, items:exercise_programme_items(*)').eq('patient_user_id', userId!).order('created_at', { ascending: false });
      q = familyId ? q.eq('family_member_id', familyId) : q.is('family_member_id', null);
      const programmes = unwrap(await q) as unknown as Prog[];
      const ids = programmes.flatMap((p) => p.items.map((i) => i.id));
      const completions = ids.length ? (unwrap(await supabase.from('exercise_completions').select('*').in('programme_item_id', ids).order('completed_at', { ascending: false }).limit(300)) as ExerciseCompletionRow[]) : [];
      return { programmes, completions };
    },
  });

  const ad = progs.data ? adherence(progs.data.programmes.map((p) => ({ ...p, therapist: null })), progs.data.completions, 7) : null;

  return (
    <Screen title={name} subtitle="Patient record">
      {bookings.isLoading ? <LoadingList /> : !first ? <EmptyState title="No appointments with this patient" /> : (
        <>
          <SectionHeader title="Appointments" />
          <View style={{ gap: 10 }}>
            {mine.slice().reverse().map((b) => (
              <Card key={b.id} onPress={() => router.push({ pathname: '/visit/[id]', params: { id: b.id } })}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}><Text variant="bodyStrong">{b.service?.name}</Text><Text variant="caption" color="textMuted">{formatDate(b.scheduled_start)}</Text></View>
                  <StatusBadge status={b.status} />
                </View>
              </Card>
            ))}
          </View>

          <SectionHeader title="Rehabilitation goals" action="Add goal" onAction={() => setGoalSheet(true)} />
          {(goals.data ?? []).length === 0 ? <Card><Text color="textMuted">No goals set yet.</Text></Card> : (
            <View style={{ gap: 10 }}>
              {(goals.data ?? []).map((g) => (
                <Card key={g.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text variant="bodyStrong" style={{ flex: 1 }}>{g.title}</Text><Badge label={g.status} tone={g.status === 'achieved' ? 'success' : 'primary'} /></View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primaryLight, marginVertical: 10, overflow: 'hidden' }}><View style={{ width: `${g.progress_percent}%`, height: 8, backgroundColor: colors.primary }} /></View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text variant="caption" color="textMuted">{g.progress_percent}% complete</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button label="−10" variant="outline" size="md" fullWidth={false} onPress={() => saveGoal.mutate({ id: g.id, title: g.title, progress_percent: Math.max(0, g.progress_percent - 10) })} />
                      <Button label="+10" variant="secondary" size="md" fullWidth={false} onPress={() => saveGoal.mutate({ id: g.id, title: g.title, progress_percent: Math.min(100, g.progress_percent + 10), status: g.progress_percent + 10 >= 100 ? 'achieved' : g.status })} />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}

          <SectionHeader title="Home exercise programmes" />
          {progs.isLoading ? <LoadingList count={1} /> : (progs.data?.programmes ?? []).length === 0 ? <Card><Text color="textMuted">No programmes prescribed yet.</Text></Card> : (
            <>
              {ad ? <Card tone="tinted"><Text variant="bodyStrong">Adherence (last 7 days)</Text><Text color="inkSoft">{ad.done} of {ad.expected} prescribed exercises done ({ad.pct}%) · {streakDays(progs.data!.completions)}-day streak</Text></Card> : null}
              {(progs.data?.programmes ?? []).map((p) => (
                <Card key={p.id} style={{ marginTop: 10 }}>
                  <Text variant="subheading">{p.title}</Text>
                  <Text variant="caption" color="textMuted">{p.frequency_per_week}×/week · {p.status}</Text>
                  {p.items.map((i) => <Row key={i.id} icon="barbell-outline" title={i.name} subtitle={[i.sets && i.reps ? `${i.sets} × ${i.reps}` : null, `${progs.data!.completions.filter((c) => c.programme_item_id === i.id).length} logged`].filter(Boolean).join(' · ')} last />)}
                </Card>
              ))}
            </>
          )}

          <SectionHeader title="Clinical notes" />
          {(notes.data ?? []).length === 0 ? <Card><Text color="textMuted">No notes yet.</Text></Card> : (
            <View style={{ gap: 10 }}>
              {(notes.data ?? []).map((n) => (
                <Card key={n.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text variant="caption" color="textMuted">{formatDate(n.created_at)}</Text>{n.share_with_patient ? <Badge label="Shared with patient" tone="info" /> : <Badge label="Private" />}</View>
                  {n.subjective ? <Text style={{ marginTop: 6 }}><Text variant="bodyStrong">S: </Text>{n.subjective}</Text> : null}
                  {n.objective ? <Text><Text variant="bodyStrong">O: </Text>{n.objective}</Text> : null}
                  {n.assessment ? <Text><Text variant="bodyStrong">A: </Text>{n.assessment}</Text> : null}
                  {n.plan ? <Text><Text variant="bodyStrong">P: </Text>{n.plan}</Text> : null}
                </Card>
              ))}
            </View>
          )}
        </>
      )}

      <Sheet visible={goalSheet} onClose={() => setGoalSheet(false)} title="New rehabilitation goal"
        footer={<Button label="Add goal" loading={saveGoal.isPending} disabled={goalTitle.trim().length < 3} onPress={async () => {
          try { await saveGoal.mutateAsync({ booking: first!, title: goalTitle.trim() }); setGoalSheet(false); setGoalTitle(''); toast.show('Goal added'); } catch (e) { toast.show(friendlyError(e), 'error'); }
        }} />}>
        <Input label="Goal" value={goalTitle} onChangeText={setGoalTitle} placeholder="e.g. Walk 500 m without pain" multiline />
      </Sheet>
    </Screen>
  );
}

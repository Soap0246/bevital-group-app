import React, { useEffect, useState } from 'react';
import { Pressable, Switch, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDate, formatDateShort, friendlyError, toKlDateString } from '@bevital/shared';
import { useFamily, useMarkNotificationsRead } from '@/api/profile';
import {
  adherence, completionsOn, streakDays, useCompleteExercise, useRecovery, useUndoCompletion, weeklyCompletionCounts, type ProgrammeWithItems,
} from '@/api/recovery';
import { BarChart, LineChart, ProgressRing } from '@/components/charts/charts';
import { Button, Card, Chip, ChipRow, EmptyState, ErrorState, Icon, LoadingList, Logo, Row, Screen, SectionHeader, Sheet, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getExerciseReminder, setExerciseReminder, type ReminderSetting } from '@/lib/notifications';
import { buildProgressReportHtml, shareProgressReport } from '@/lib/report';
import { colors, radius } from '@/theme';

function GoalBar({ title, pct, target }: { title: string; pct: number; target?: string | null }) {
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${title}, ${pct} percent`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>{title}</Text>
        <Text variant="bodyStrong" color="primaryDark">{pct}%</Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.primaryLight, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
      </View>
      {target ? <Text variant="caption" color="textMuted">Target: {formatDate(target)}</Text> : null}
    </View>
  );
}

export default function Recovery() {
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const chartW = Math.min(width - 40 - 32, 460);
  const { profile } = useAuth();
  const family = useFamily();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const recovery = useRecovery(familyId);
  const complete = useCompleteExercise();
  const undo = useUndoCompletion();
  const markRead = useMarkNotificationsRead();
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [reminder, setReminder] = useState<ReminderSetting>({ enabled: false, hour: 18, minute: 0 });
  const [reporting, setReporting] = useState(false);

  useEffect(() => { void getExerciseReminder().then(setReminder); }, []);
  void markRead;

  const data = recovery.data;
  const today = toKlDateString();
  const week = data ? adherence(data.programmes, data.completions) : null;
  const completedSessions = (data?.sessions ?? []).filter((s) => s.ended_at).length;
  const activeProgrammes = (data?.programmes ?? []).filter((p) => p.status === 'active');
  const painPoints = [...(data?.sessions ?? [])].reverse().slice(-8).map((s) => ({ label: formatDateShort(s.started_at), value: s.pain_score_after ?? s.pain_score_before ?? null }));
  const personName = familyId ? family.data?.find((m) => m.id === familyId)?.full_name ?? 'Patient' : profile?.full_name ?? 'Patient';

  const toggleReminder = async (next: ReminderSetting) => {
    setReminder(next);
    const r = await setExerciseReminder(next);
    if (r === 'denied') { setReminder({ ...next, enabled: false }); toast.show('Allow notifications in Settings to get reminders.', 'error'); }
    if (r === 'unsupported') toast.show('Reminders are available in the mobile app.', 'info');
  };

  const mark = async () => {
    if (!pending) return;
    try { await complete.mutateAsync({ itemId: pending.id, painLevel: pain }); toast.show('Great work! Exercise logged.'); setPending(null); setPain(null); }
    catch (e) { toast.show(friendlyError(e), 'error'); }
  };

  const download = async () => {
    if (!data) return;
    setReporting(true);
    try { await shareProgressReport(buildProgressReportHtml(personName, data)); } catch (e) { toast.show(friendlyError(e), 'error'); } finally { setReporting(false); }
  };

  const renderProgramme = (p: ProgrammeWithItems) => (
    <Card key={p.id} style={{ gap: 4 }}>
      <Text variant="subheading">{p.title}</Text>
      <Text variant="caption" color="textMuted" style={{ marginBottom: 8 }}>{p.frequency_per_week}× per week{p.therapist?.display_name ? ` · from ${p.therapist.display_name}` : ''}</Text>
      {p.items.map((it, i) => {
        const doneToday = completionsOn(data!.completions, it.id, today);
        const isDone = doneToday.length > 0;
        return (
          <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
            <Pressable
              accessibilityRole="checkbox" accessibilityState={{ checked: isDone }} accessibilityLabel={`${it.name}, ${isDone ? 'done today. Tap to undo' : 'mark as done'}`}
              onPress={() => (isDone ? undo.mutate(doneToday[0]!.id) : setPending({ id: it.id, name: it.name }))}
              style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: isDone ? colors.success : colors.borderStrong, backgroundColor: isDone ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {isDone ? <Icon name="checkmark" size={24} color="surface" /> : null}
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: it.id } })} accessibilityRole="button" accessibilityLabel={`${it.name} details`}>
              <Text variant="bodyStrong">{it.name}</Text>
              <Text variant="caption" color="textMuted">{[it.sets && it.reps ? `${it.sets} × ${it.reps}` : null, it.hold_seconds ? `hold ${it.hold_seconds}s` : null].filter(Boolean).join(' · ') || 'See instructions'}</Text>
            </Pressable>
            <Icon name={it.video_url ? 'play-circle' : 'chevron-forward'} size={it.video_url ? 30 : 20} color={it.video_url ? 'primary' : 'textSubtle'} />
          </View>
        );
      })}
    </Card>
  );

  return (
    <Screen header={<View style={{ paddingHorizontal: 20, paddingTop: 10 }}><Logo variant="nolb" height={34} /></View>} refreshing={recovery.isRefetching} onRefresh={() => void recovery.refetch()}>
      <Text variant="title" style={{ marginTop: 12 }}>My Recovery Journey</Text>
      {(family.data ?? []).length > 0 ? (
        <View style={{ marginTop: 12 }}>
          <ChipRow>
            <Chip label="Me" icon="person" selected={!familyId} onPress={() => setFamilyId(null)} />
            {(family.data ?? []).map((m) => <Chip key={m.id} label={m.full_name} icon="people" selected={familyId === m.id} onPress={() => setFamilyId(m.id)} />)}
          </ChipRow>
        </View>
      ) : null}

      {recovery.isLoading ? <View style={{ marginTop: 16 }}><LoadingList /></View> : recovery.isError ? <ErrorState error={recovery.error} onRetry={() => recovery.refetch()} /> : data ? (
        data.programmes.length === 0 && data.goals.length === 0 && data.sessions.length === 0 ? (
          <EmptyState icon="pulse-outline" title="Your journey starts here" body="After your first session your physiotherapist can set goals and a home exercise programme that will appear here." actionLabel="Book a physiotherapist" onAction={() => router.push('/book')} />
        ) : (
          <View style={{ gap: 16, marginTop: 16 }}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <ProgressRing value={week?.pct ?? 0} size={112} label="Weekly exercise progress" sublabel="this week" />
                <View style={{ flex: 1, gap: 10 }}>
                  <Row icon="flame-outline" title={`${streakDays(data.completions)}-day streak`} />
                  <Row icon="checkmark-done-outline" title={`${completedSessions} sessions completed`} />
                  <Row icon="flag-outline" title={`${data.goals.filter((g) => g.status === 'active').length} active goals`} last />
                </View>
              </View>
            </Card>

            {data.goals.length > 0 ? (
              <>
                <SectionHeader title="My goals" />
                <Card><View style={{ gap: 18 }}>{data.goals.map((g) => <GoalBar key={g.id} title={g.title} pct={g.status === 'achieved' ? 100 : g.progress_percent} target={g.target_date} />)}</View></Card>
              </>
            ) : null}

            {activeProgrammes.length > 0 ? (
              <>
                <SectionHeader title="Today's exercises" />
                {activeProgrammes.map(renderProgramme)}
              </>
            ) : null}

            <SectionHeader title="Progress" />
            <Card>
              <Text variant="subheading" style={{ marginBottom: 8 }}>Pain level after each session (0–10)</Text>
              {painPoints.filter((p) => p.value != null).length >= 2
                ? <LineChart data={painPoints} width={chartW} ariaLabel="Pain level trend across sessions" />
                : <Text color="textMuted">Your pain trend appears once two sessions have recorded pain scores.</Text>}
            </Card>
            <Card>
              <Text variant="subheading" style={{ marginBottom: 8 }}>Exercises completed per week</Text>
              <BarChart data={weeklyCompletionCounts(data.completions)} width={chartW} ariaLabel="Exercises completed per week" />
            </Card>

            {data.notes.length > 0 ? (
              <>
                <SectionHeader title="Notes from your physiotherapist" />
                {data.notes.slice(0, 5).map((n) => (
                  <Card key={n.id}>
                    <Text variant="caption" color="textMuted">{formatDate(n.created_at)}</Text>
                    <Text style={{ marginTop: 4 }}>{n.patient_summary ?? n.assessment ?? n.plan}</Text>
                    {n.plan && n.patient_summary ? <Text variant="caption" color="textMuted" style={{ marginTop: 6 }}>Plan: {n.plan}</Text> : null}
                  </Card>
                ))}
              </>
            ) : null}

            {data.sessions.length > 0 ? (
              <>
                <SectionHeader title="Treatment sessions" />
                <Card>
                  {data.sessions.slice(0, 8).map((s, i, arr) => (
                    <Row key={s.id} icon="medkit-outline" title={s.booking?.service?.name ?? 'Session'} subtitle={`${formatDate(s.started_at)}${s.pain_score_before != null ? ` · pain ${s.pain_score_before}→${s.pain_score_after ?? '–'}` : ''}`} last={i === arr.length - 1} />
                  ))}
                </Card>
              </>
            ) : null}

            <SectionHeader title="Reminders & reports" />
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name="alarm-outline" size={26} color="primary" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">Daily exercise reminder</Text>
                  <Text variant="caption" color="textMuted">A gentle nudge on this device.</Text>
                </View>
                <Switch value={reminder.enabled} onValueChange={(v) => toggleReminder({ ...reminder, enabled: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} accessibilityLabel="Daily exercise reminder" />
              </View>
              {reminder.enabled ? (
                <View style={{ marginTop: 12 }}>
                  <ChipRow>
                    {[8, 12, 18, 20].map((h) => <Chip key={h} label={`${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`} selected={reminder.hour === h} onPress={() => toggleReminder({ ...reminder, hour: h })} />)}
                  </ChipRow>
                </View>
              ) : null}
            </Card>
            <Button label="Download progress report (PDF)" icon="download-outline" variant="outline" loading={reporting} onPress={download} />
          </View>
        )
      ) : null}

      <Sheet visible={!!pending} onClose={() => { setPending(null); setPain(null); }} title="Nice work!" footer={<Button label="Log exercise" loading={complete.isPending} onPress={mark} />}>
        <Text>{pending?.name}</Text>
        <Text variant="subheading">How much pain did you feel? (optional)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Array.from({ length: 11 }, (_, n) => (
            <Pressable key={n} onPress={() => setPain(pain === n ? null : n)} accessibilityRole="button" accessibilityState={{ selected: pain === n }} accessibilityLabel={`Pain ${n}`}
              style={{ width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: pain === n ? colors.primary : colors.surfaceAlt, borderWidth: 1, borderColor: pain === n ? colors.primary : colors.border }}>
              <Text variant="bodyStrong" color={pain === n ? 'surface' : 'ink'}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <Text variant="caption" color="textMuted">0 = no pain · 10 = worst pain. If pain is severe or getting worse, stop and contact your physiotherapist.</Text>
      </Sheet>
    </Screen>
  );
}

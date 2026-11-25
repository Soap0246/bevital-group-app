import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ClinicalNoteRow, ExerciseCompletionRow, ExerciseItemRow, ExerciseProgrammeRow, RehabGoalRow, TreatmentSessionRow,
} from '@bevital/shared';
import { addDaysToDateString, toKlDateString } from '@bevital/shared';
import { supabase } from '@/lib/supabase';
import { keys } from '@/lib/query';
import { useAuth } from '@/lib/auth';
import { unwrap } from './catalog';

export type ProgrammeWithItems = ExerciseProgrammeRow & { items: ExerciseItemRow[]; therapist?: { display_name: string } | null };
export type SessionWithService = TreatmentSessionRow & { booking: { reference: string; service: { name: string } | null } | null };

export interface RecoveryData {
  goals: RehabGoalRow[];
  programmes: ProgrammeWithItems[];
  completions: ExerciseCompletionRow[];
  sessions: SessionWithService[];
  notes: ClinicalNoteRow[];
}

/** Everything the "My Recovery Journey" dashboard needs for the patient (or one family member). */
export function useRecovery(familyId: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: keys.recovery(familyId),
    enabled: !!session,
    queryFn: async (): Promise<RecoveryData> => {
      const uid = session!.user.id;
      // Filters a query to this patient (or one family member). Typed loosely on purpose: the
      // supabase-js builder generics are deeply recursive.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scope = (q: any) => {
        const own = q.eq('patient_user_id', uid);
        return familyId ? own.eq('family_member_id', familyId) : own.is('family_member_id', null);
      };
      const since = addDaysToDateString(toKlDateString(), -60);
      const [goals, programmes, sessions, notes] = await Promise.all([
        scope(supabase.from('rehabilitation_goals').select('*')).order('created_at', { ascending: false }),
        scope(supabase.from('exercise_programmes').select('*, items:exercise_programme_items(*), therapist:therapist_profiles(display_name)')).order('created_at', { ascending: false }),
        scope(supabase.from('treatment_sessions').select('*, booking:bookings(reference, service:services(name))')).order('started_at', { ascending: false }).limit(30),
        scope(supabase.from('clinical_notes').select('*')).order('created_at', { ascending: false }).limit(20),
      ]);
      const progs = (unwrap(programmes as never) as ProgrammeWithItems[]).map((p) => ({ ...p, items: [...(p.items ?? [])].sort((a, b) => a.sort_order - b.sort_order) }));
      const itemIds = progs.flatMap((p) => p.items.map((i) => i.id));
      const completions = itemIds.length
        ? (unwrap(await supabase.from('exercise_completions').select('*').in('programme_item_id', itemIds).gte('completed_on', since).order('completed_at', { ascending: false })) as ExerciseCompletionRow[])
        : [];
      return {
        goals: unwrap(goals as never) as RehabGoalRow[],
        programmes: progs,
        completions,
        sessions: unwrap(sessions as never) as SessionWithService[],
        notes: unwrap(notes as never) as ClinicalNoteRow[],
      };
    },
  });
}

export function useCompleteExercise() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (i: { itemId: string; painLevel?: number | null }) => {
      const { error } = await supabase.from('exercise_completions').insert({
        programme_item_id: i.itemId, patient_user_id: session!.user.id, pain_level: i.painLevel ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recovery'] }),
  });
}

export function useUndoCompletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (completionId: string) => {
      const { error } = await supabase.from('exercise_completions').delete().eq('id', completionId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recovery'] }),
  });
}

// ───────────────────────── Derived metrics (pure, from real rows) ─────────────────────────
export function completionsOn(completions: ExerciseCompletionRow[], itemId: string, ymd: string) {
  return completions.filter((c) => c.programme_item_id === itemId && c.completed_on === ymd);
}

/** Adherence for the last `days` days: distinct (exercise, day) completions vs. prescribed volume. */
export function adherence(programmes: ProgrammeWithItems[], completions: ExerciseCompletionRow[], days = 7) {
  const today = toKlDateString();
  const from = addDaysToDateString(today, -(days - 1));
  const active = programmes.filter((p) => p.status === 'active');
  const expected = active.reduce((sum, p) => sum + p.items.length * Math.min(p.frequency_per_week, 7) * (days / 7), 0);
  const done = new Set(
    completions.filter((c) => c.completed_on >= from && c.completed_on <= today).map((c) => `${c.programme_item_id}|${c.completed_on}`),
  ).size;
  return { expected: Math.round(expected), done, pct: expected > 0 ? Math.min(100, Math.round((done / expected) * 100)) : 0 };
}

/** Distinct days with at least one completion, newest streak first. */
export function streakDays(completions: ExerciseCompletionRow[]): number {
  const days = new Set(completions.map((c) => c.completed_on));
  let streak = 0;
  let d = toKlDateString();
  if (!days.has(d)) d = addDaysToDateString(d, -1); // today may not be done yet
  while (days.has(d)) {
    streak++;
    d = addDaysToDateString(d, -1);
  }
  return streak;
}

export function weeklyCompletionCounts(completions: ExerciseCompletionRow[], weeks = 4): Array<{ label: string; value: number }> {
  const today = toKlDateString();
  return Array.from({ length: weeks }, (_, i) => {
    const end = addDaysToDateString(today, -7 * (weeks - 1 - i));
    const start = addDaysToDateString(end, -6);
    const value = new Set(completions.filter((c) => c.completed_on >= start && c.completed_on <= end).map((c) => `${c.programme_item_id}|${c.completed_on}`)).size;
    return { label: i === weeks - 1 ? 'This wk' : `${weeks - 1 - i}w ago`, value };
  });
}

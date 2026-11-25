import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { uploadPrivateFile } from '@/lib/upload';
import type {
  AvailabilityRow, BookingStatus, ClinicalNoteRow, ExerciseItemRow, PatientHealthView, RehabGoalRow,
  ServiceRow, TherapistCredentialRow, TherapistEarningsSummary, TreatmentSessionRow, UUID, CredentialType,
} from '@bevital/shared';
import { supabase } from '@/lib/supabase';
import { keys } from '@/lib/query';
import { useAuth } from '@/lib/auth';
import { unwrap } from './catalog';
import { useBookingsRealtime, type BookingWithRefs } from './bookings';

export interface TherapistBooking extends BookingWithRefs {
  patient: { full_name: string; phone: string | null } | null;
}

const T_SELECT = `*,
  service:services(id,name,slug,duration_minutes),
  clinic:clinics(id,name,address_line1,city,latitude,longitude),
  family:family_members(full_name),
  patient:users!bookings_patient_user_id_fkey(full_name,phone)`;

export function useTherapistBookings() {
  const { therapist } = useAuth();
  useBookingsRealtime('therapist_id', therapist?.id);
  return useQuery({
    queryKey: keys.therapistBookings,
    enabled: !!therapist,
    queryFn: async () =>
      unwrap(await supabase.from('bookings').select(T_SELECT).neq('status', 'pending').order('scheduled_start', { ascending: true })) as unknown as TherapistBooking[],
  });
}

export function useTherapistBooking(id: string | undefined) {
  return useQuery({
    queryKey: ['therapist-booking', id],
    enabled: !!id,
    queryFn: async () => unwrap(await supabase.from('bookings').select(T_SELECT).eq('id', id!).maybeSingle()) as unknown as TherapistBooking | null,
  });
}

export function useRespondToBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { bookingId: string; accept: boolean; reason?: string }) =>
      unwrap(await supabase.rpc('therapist_respond_to_booking', { p_booking_id: i.bookingId, p_accept: i.accept, p_reason: i.reason ?? null })),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useUpdateBookingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { bookingId: string; status: BookingStatus; note?: string }) =>
      unwrap(await supabase.rpc('update_booking_status', { p_booking_id: i.bookingId, p_new_status: i.status, p_note: i.note ?? null })),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Audited, consent-checked read of the patient's health profile (never a direct table read). */
export function usePatientHealth(bookingId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['patient-health', bookingId],
    enabled: !!bookingId && enabled,
    retry: false,
    staleTime: 60_000,
    queryFn: async () => unwrap(await supabase.rpc('therapist_get_patient_health', { p_booking_id: bookingId! })) as PatientHealthView,
  });
}

// ───────────────────────── Live location (real GPS, only while on the way) ─────────────────────────
/**
 * While `active`, publishes the therapist device's real GPS fix to therapist_live_locations so the patient
 * can follow along. Requires foreground location permission; does nothing on web.
 */
export function useShareLiveLocation(bookingId: string | undefined, therapistId: string | undefined, active: boolean) {
  useEffect(() => {
    if (!active || !bookingId || !therapistId || Platform.OS === 'web') return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 25 },
        async (pos) => {
          await supabase.from('therapist_live_locations').upsert({
            booking_id: bookingId, therapist_id: therapistId,
            latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)),
            heading: pos.coords.heading ?? null, speed_mps: pos.coords.speed ?? null, recorded_at: new Date().toISOString(),
          });
        },
      );
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active, bookingId, therapistId]);
}

/** Patient side: the therapist's real position, when (and only when) the therapist device is reporting one. */
export function useLiveLocation(bookingId: string | undefined, active: boolean) {
  const qc = useQueryClient();
  const uid = useRef(Math.random().toString(36).slice(2)).current;
  const query = useQuery({
    queryKey: ['live-location', bookingId],
    enabled: !!bookingId && active,
    refetchInterval: active ? 20_000 : false,
    queryFn: async () =>
      unwrap(await supabase.from('therapist_live_locations').select('*').eq('booking_id', bookingId!).maybeSingle()) as
        | { latitude: number; longitude: number; recorded_at: string }
        | null,
  });
  useEffect(() => {
    if (!bookingId || !active) return;
    const ch = supabase
      .channel(`live-${bookingId}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'therapist_live_locations', filter: `booking_id=eq.${bookingId}` }, () =>
        qc.invalidateQueries({ queryKey: ['live-location', bookingId] }))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [bookingId, active, qc, uid]);
  return query;
}

// ───────────────────────── Availability ─────────────────────────
export function useMyAvailability() {
  const { therapist } = useAuth();
  return useQuery({
    queryKey: keys.availability,
    enabled: !!therapist,
    queryFn: async () => {
      const [windows, off] = await Promise.all([
        supabase.from('therapist_availability').select('*').eq('therapist_id', therapist!.id).order('day_of_week').order('start_time'),
        supabase.from('therapist_time_off').select('*').eq('therapist_id', therapist!.id).gte('ends_at', new Date().toISOString()).order('starts_at'),
      ]);
      return {
        windows: unwrap(windows as never) as AvailabilityRow[],
        timeOff: unwrap(off as never) as Array<{ id: UUID; starts_at: string; ends_at: string; reason: string | null }>,
      };
    },
  });
}

export function useAvailabilityMutations() {
  const qc = useQueryClient();
  const { therapist } = useAuth();
  const done = () => qc.invalidateQueries({ queryKey: keys.availability });
  return {
    add: useMutation({
      mutationFn: async (w: { day_of_week: number; start_time: string; end_time: string; location_type: 'clinic' | 'home' | 'both' }) => {
        const { error } = await supabase.from('therapist_availability').insert({ ...w, therapist_id: therapist!.id });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('therapist_availability').delete().eq('id', id);
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    addTimeOff: useMutation({
      mutationFn: async (t: { starts_at: string; ends_at: string; reason?: string }) => {
        const { error } = await supabase.from('therapist_time_off').insert({ ...t, therapist_id: therapist!.id });
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
    removeTimeOff: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('therapist_time_off').delete().eq('id', id);
        if (error) throw new Error(error.message);
      },
      onSuccess: done,
    }),
  };
}

// ───────────────────────── Profile, services, credentials ─────────────────────────
export function useUpdateTherapistProfile() {
  const { therapist, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('therapist_profiles').update(patch).eq('id', therapist!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshProfile(),
  });
}

export function useSetServiceBase() {
  const { therapist } = useAuth();
  return useMutation({
    mutationFn: async (p: { latitude: number; longitude: number }) => {
      const { error } = await supabase.from('therapist_private').upsert({ therapist_id: therapist!.id, base_latitude: p.latitude, base_longitude: p.longitude, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
  });
}

export function useMyBase() {
  const { therapist } = useAuth();
  return useQuery({
    queryKey: ['therapist-base'],
    enabled: !!therapist,
    queryFn: async () => unwrap(await supabase.from('therapist_private').select('*').eq('therapist_id', therapist!.id).maybeSingle()) as { base_latitude: number | null; base_longitude: number | null } | null,
  });
}

export function useMyOfferedServices() {
  const { therapist } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['my-services'],
    enabled: !!therapist,
    queryFn: async () => {
      const [all, mine] = await Promise.all([
        supabase.from('services').select('*').order('sort_order'),
        supabase.from('therapist_services').select('service_id').eq('therapist_id', therapist!.id),
      ]);
      return {
        all: unwrap(all as never) as ServiceRow[],
        offered: new Set((unwrap(mine as never) as Array<{ service_id: string }>).map((r) => r.service_id)),
      };
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ serviceId, on }: { serviceId: string; on: boolean }) => {
      const res = on
        ? await supabase.from('therapist_services').insert({ therapist_id: therapist!.id, service_id: serviceId })
        : await supabase.from('therapist_services').delete().eq('therapist_id', therapist!.id).eq('service_id', serviceId);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-services'] }),
  });
  return { ...query, toggle };
}

export function useCredentials() {
  const { therapist } = useAuth();
  return useQuery({
    queryKey: keys.credentials,
    enabled: !!therapist,
    queryFn: async () => unwrap(await supabase.from('therapist_credentials').select('*').eq('therapist_id', therapist!.id).order('created_at', { ascending: false })) as TherapistCredentialRow[],
  });
}


export function useSubmitCredential() {
  const qc = useQueryClient();
  const { therapist, session, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (i: {
      type: CredentialType; title: string; issuer?: string; number: string; expiresOn?: string;
      file?: { uri: string; name: string; mimeType?: string };
    }) => {
      const documentPath = i.file ? await uploadPrivateFile('therapist-credentials', session!.user.id, i.file) : null;
      const { error } = await supabase.from('therapist_credentials').insert({
        therapist_id: therapist!.id, credential_type: i.type, title: i.title, issuer: i.issuer || null,
        credential_number: i.number, expires_on: i.expiresOn || null, document_path: documentPath,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.credentials });
      await refreshProfile();
    },
  });
}

export function useEarnings() {
  const { therapist } = useAuth();
  return useQuery({
    queryKey: keys.earnings,
    enabled: !!therapist,
    queryFn: async () => unwrap(await supabase.rpc('therapist_earnings_summary')) as TherapistEarningsSummary,
  });
}

// ───────────────────────── Treatment documentation ─────────────────────────
export function useSessionForBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['session', bookingId],
    enabled: !!bookingId,
    queryFn: async () => unwrap(await supabase.from('treatment_sessions').select('*').eq('booking_id', bookingId!).maybeSingle()) as TreatmentSessionRow | null,
  });
}

export function useSaveSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { sessionId: string; pain_score_before?: number | null; pain_score_after?: number | null; patient_summary?: string | null }) => {
      const { sessionId, ...patch } = i;
      const { error } = await supabase.from('treatment_sessions').update(patch).eq('id', sessionId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['session'] }),
  });
}

export function useNotesForPatient(patientUserId: string | undefined, familyId: string | null) {
  return useQuery({
    queryKey: ['notes', patientUserId, familyId],
    enabled: !!patientUserId,
    queryFn: async () => {
      let q = supabase.from('clinical_notes').select('*').eq('patient_user_id', patientUserId!).order('created_at', { ascending: false });
      q = familyId ? q.eq('family_member_id', familyId) : q.is('family_member_id', null);
      return unwrap(await q) as ClinicalNoteRow[];
    },
  });
}

export function useSaveNote() {
  const qc = useQueryClient();
  const { therapist } = useAuth();
  return useMutation({
    mutationFn: async (i: {
      booking: Pick<TherapistBooking, 'id' | 'patient_user_id' | 'family_member_id'>;
      sessionId?: string | null;
      subjective?: string; objective?: string; assessment?: string; plan?: string; patientSummary?: string; share: boolean;
    }) => {
      const { error } = await supabase.from('clinical_notes').insert({
        booking_id: i.booking.id, treatment_session_id: i.sessionId ?? null, therapist_id: therapist!.id,
        patient_user_id: i.booking.patient_user_id, family_member_id: i.booking.family_member_id,
        subjective: i.subjective || null, objective: i.objective || null, assessment: i.assessment || null,
        plan: i.plan || null, patient_summary: i.patientSummary || null, share_with_patient: i.share,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useGoals(patientUserId: string | undefined, familyId: string | null) {
  return useQuery({
    queryKey: ['goals', patientUserId, familyId],
    enabled: !!patientUserId,
    queryFn: async () => {
      let q = supabase.from('rehabilitation_goals').select('*').eq('patient_user_id', patientUserId!).order('created_at', { ascending: false });
      q = familyId ? q.eq('family_member_id', familyId) : q.is('family_member_id', null);
      return unwrap(await q) as RehabGoalRow[];
    },
  });
}

export function useSaveGoal() {
  const qc = useQueryClient();
  const { therapist } = useAuth();
  return useMutation({
    mutationFn: async (i: { id?: string; booking?: Pick<TherapistBooking, 'patient_user_id' | 'family_member_id'>; title: string; target_date?: string; progress_percent?: number; status?: RehabGoalRow['status'] }) => {
      if (i.id) {
        const { id, booking: _b, ...patch } = i;
        const { error } = await supabase.from('rehabilitation_goals').update(patch).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('rehabilitation_goals').insert({
          therapist_id: therapist!.id, patient_user_id: i.booking!.patient_user_id, family_member_id: i.booking!.family_member_id,
          title: i.title, target_date: i.target_date || null,
        });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useCreateProgramme() {
  const qc = useQueryClient();
  const { therapist } = useAuth();
  return useMutation({
    mutationFn: async (i: {
      booking: Pick<TherapistBooking, 'id' | 'patient_user_id' | 'family_member_id'>;
      title: string; description?: string; frequency: number;
      items: Array<Pick<ExerciseItemRow, 'name'> & Partial<ExerciseItemRow>>;
    }) => {
      const prog = unwrap(await supabase.from('exercise_programmes').insert({
        patient_user_id: i.booking.patient_user_id, family_member_id: i.booking.family_member_id, therapist_id: therapist!.id,
        booking_id: i.booking.id, title: i.title, description: i.description || null, frequency_per_week: i.frequency,
      }).select('id').single()) as { id: string };
      const { error } = await supabase.from('exercise_programme_items').insert(
        i.items.map((it, idx) => ({ programme_id: prog.id, name: it.name, instructions: it.instructions || null, sets: it.sets ?? null, reps: it.reps ?? null, hold_seconds: it.hold_seconds ?? null, video_url: it.video_url || null, sort_order: idx })),
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recovery'] }),
  });
}

/** Distinct patients derived from the therapist's own bookings (RLS already restricts to assigned patients). */
export function groupPatients(bookings: TherapistBooking[]) {
  const map = new Map<string, { key: string; name: string; patient_user_id: string; family_member_id: string | null; bookings: TherapistBooking[]; lastBooking: TherapistBooking }>();
  for (const b of bookings) {
    const key = `${b.patient_user_id}|${b.family_member_id ?? 'self'}`;
    const name = b.family?.full_name ?? b.patient?.full_name ?? 'Patient';
    const entry = map.get(key) ?? { key, name, patient_user_id: b.patient_user_id, family_member_id: b.family_member_id, bookings: [], lastBooking: b };
    entry.bookings.push(b);
    if (new Date(b.scheduled_start) > new Date(entry.lastBooking.scheduled_start)) entry.lastBooking = b;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => +new Date(b.lastBooking.scheduled_start) - +new Date(a.lastBooking.scheduled_start));
}

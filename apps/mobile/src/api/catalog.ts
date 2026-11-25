import { useQueries, useQuery } from '@tanstack/react-query';
import type {
  AppointmentType, AvailabilityRow, AvailableTherapist, AvailableTime, ClinicRow, EducationArticleRow,
  PromotionRow, ReviewRow, ServiceCategoryRow, ServiceRow, TherapistProfileRow,
} from '@bevital/shared';
import { supabase } from '@/lib/supabase';
import { keys } from '@/lib/query';

export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async () =>
      unwrap(await supabase.from('service_categories').select('*').order('sort_order')) as ServiceCategoryRow[],
    staleTime: 10 * 60_000,
  });
}

export function useServices() {
  return useQuery({
    queryKey: keys.services(),
    queryFn: async () => unwrap(await supabase.from('services').select('*').order('sort_order')) as ServiceRow[],
    staleTime: 5 * 60_000,
  });
}

export function useService(slug: string | undefined) {
  return useQuery({
    queryKey: keys.service(slug ?? ''),
    enabled: !!slug,
    queryFn: async () => unwrap(await supabase.from('services').select('*').eq('slug', slug!).maybeSingle()) as ServiceRow | null,
  });
}

export function useServiceById(id: string | undefined) {
  return useQuery({
    queryKey: ['service-id', id],
    enabled: !!id,
    queryFn: async () => unwrap(await supabase.from('services').select('*').eq('id', id!).maybeSingle()) as ServiceRow | null,
  });
}

export function useClinics() {
  return useQuery({
    queryKey: keys.clinics,
    queryFn: async () => unwrap(await supabase.from('clinics').select('*').order('name')) as ClinicRow[],
    staleTime: 10 * 60_000,
  });
}

/** Public platform settings as a plain object (e.g. settings.platform_fee). */
export function usePublicSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: async () => {
      const rows = unwrap(await supabase.from('system_settings').select('key,value')) as Array<{ key: string; value: unknown }>;
      return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
    },
    staleTime: 10 * 60_000,
  });
}

export function useFeaturedPromotions() {
  return useQuery({
    queryKey: keys.promotions,
    queryFn: async () => unwrap(await supabase.from('promotions').select('*').order('valid_until')) as PromotionRow[],
  });
}

export function useArticles() {
  return useQuery({
    queryKey: keys.articles,
    queryFn: async () =>
      unwrap(await supabase.from('education_articles').select('*').order('published_at', { ascending: false })) as EducationArticleRow[],
  });
}

// ───────────────────────── Therapists ─────────────────────────
export function useDiscoverTherapists() {
  return useQuery({
    queryKey: ['therapists', 'discover'],
    queryFn: async () =>
      unwrap(
        await supabase.from('therapist_profiles').select('*')
          .eq('verification_status', 'verified').eq('is_accepting_bookings', true)
          .order('rating_avg', { ascending: false }).order('rating_count', { ascending: false }).limit(20),
      ) as TherapistProfileRow[],
  });
}

export interface TherapistDetail {
  profile: TherapistProfileRow;
  services: Array<Pick<ServiceRow, 'id' | 'slug' | 'name' | 'duration_minutes' | 'supports_clinic' | 'supports_home' | 'price_clinic' | 'price_home'>>;
  availability: AvailabilityRow[];
  clinic: ClinicRow | null;
  reviews: ReviewRow[];
}

export function useTherapist(id: string | undefined) {
  return useQuery({
    queryKey: keys.therapist(id ?? ''),
    enabled: !!id,
    queryFn: async (): Promise<TherapistDetail | null> => {
      const profile = unwrap(await supabase.from('therapist_profiles').select('*').eq('id', id!).maybeSingle()) as TherapistProfileRow | null;
      if (!profile) return null;
      const [svc, avail, reviews, clinic] = await Promise.all([
        supabase.from('therapist_services').select('service:services(id,slug,name,duration_minutes,supports_clinic,supports_home,price_clinic,price_home)').eq('therapist_id', id!),
        supabase.from('therapist_availability').select('*').eq('therapist_id', id!).order('day_of_week').order('start_time'),
        supabase.from('reviews').select('*').eq('therapist_id', id!).eq('is_published', true).order('created_at', { ascending: false }).limit(20),
        profile.clinic_id ? supabase.from('clinics').select('*').eq('id', profile.clinic_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      const services = (unwrap(svc as never) as Array<{ service: TherapistDetail['services'][number] | null }>)
        .map((r) => r.service).filter((s): s is TherapistDetail['services'][number] => !!s);
      return {
        profile,
        services,
        availability: unwrap(avail as never) as AvailabilityRow[],
        reviews: unwrap(reviews as never) as ReviewRow[],
        clinic: (clinic.data as ClinicRow | null) ?? null,
      };
    },
  });
}

// ───────────────────────── Availability (real, server-computed) ─────────────────────────
export interface SlotQuery {
  serviceId: string;
  type: AppointmentType;
  date: string; // YYYY-MM-DD (Malaysian date)
  clinicId?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export function useAvailableTimes(q: SlotQuery | null) {
  return useQuery({
    queryKey: keys.availableTimes(q),
    enabled: !!q,
    staleTime: 15_000,
    queryFn: async () =>
      unwrap(await supabase.rpc('get_available_times', {
        p_service_id: q!.serviceId, p_type: q!.type, p_date: q!.date,
        p_clinic_id: q!.clinicId ?? null, p_lat: q!.lat ?? null, p_lng: q!.lng ?? null,
      })) as AvailableTime[],
  });
}

/** Looks ahead `dates.length` days so the date strip can grey out fully-booked days and open on the first free one. */
export function useAvailabilityCalendar(base: Omit<SlotQuery, 'date'> | null, dates: string[]) {
  const results = useQueries({
    queries: dates.map((date) => {
      const q: SlotQuery | null = base ? { ...base, date } : null;
      return {
        queryKey: keys.availableTimes(q),
        enabled: !!q,
        staleTime: 30_000,
        queryFn: async () =>
          unwrap(await supabase.rpc('get_available_times', {
            p_service_id: q!.serviceId, p_type: q!.type, p_date: q!.date,
            p_clinic_id: q!.clinicId ?? null, p_lat: q!.lat ?? null, p_lng: q!.lng ?? null,
          })) as AvailableTime[],
      };
    }),
  });
  return dates.map((date, i) => ({ date, loading: !!base && results[i].isPending, count: results[i].data?.length ?? 0, failed: results[i].isError }));
}

/** Registration number (admin-approved only) and completed-session count for physiotherapists. */
export function useTherapistStats(ids: string[]) {
  const key = [...ids].sort().join(',');
  return useQuery({
    queryKey: ['therapist-stats', key],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('therapist_public_stats', { p_ids: ids });
      if (error) return {} as Record<string, { registration: string | null; sessions: number }>;
      const rows = (data ?? []) as Array<{ therapist_id: string; registration_number: string | null; completed_sessions: number }>;
      return Object.fromEntries(rows.map((r) => [r.therapist_id, { registration: r.registration_number, sessions: r.completed_sessions }]));
    },
  });
}

export interface TherapistQuery {
  serviceId: string;
  type: AppointmentType;
  startAt: string; // ISO
  clinicId?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export function useAvailableTherapists(q: TherapistQuery | null) {
  return useQuery({
    queryKey: keys.availableTherapists(q),
    enabled: !!q,
    staleTime: 15_000,
    queryFn: async () =>
      unwrap(await supabase.rpc('search_available_therapists', {
        p_service_id: q!.serviceId, p_type: q!.type, p_start: q!.startAt,
        p_clinic_id: q!.clinicId ?? null, p_lat: q!.lat ?? null, p_lng: q!.lng ?? null,
      })) as AvailableTherapist[],
  });
}

/** Verified, bookable therapists who offer a given service. */
export function useTherapistsForService(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['therapists-for-service', serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('therapist_services').select('therapist:therapist_profiles(*)').eq('service_id', serviceId!),
      ) as unknown as Array<{ therapist: TherapistProfileRow | null }>;
      return rows
        .map((r) => r.therapist)
        .filter((t): t is TherapistProfileRow => !!t && t.verification_status === 'verified' && t.is_accepting_bookings)
        .sort((a, b) => Number(b.rating_avg) - Number(a.rating_avg));
    },
  });
}

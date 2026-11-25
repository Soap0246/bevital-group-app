import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { AppointmentType, BookingQuote, BookingRow, BookingStatus, BookingStatusHistoryRow, PaymentMethod, PaymentRow, UUID } from '@bevital/shared';
import { supabase } from '@/lib/supabase';
import { keys } from '@/lib/query';
import { useAuth } from '@/lib/auth';
import { unwrap } from './catalog';

export interface BookingWithRefs extends BookingRow {
  service: { id: UUID; name: string; slug: string; duration_minutes: number } | null;
  therapist: { id: UUID; display_name: string; avatar_url: string | null; user_id: UUID } | null;
  clinic: { id: UUID; name: string; address_line1: string; city: string; latitude: number | null; longitude: number | null; phone: string | null } | null;
  family: { full_name: string } | null;
}

const BOOKING_SELECT = `*,
  service:services(id,name,slug,duration_minutes),
  therapist:therapist_profiles!bookings_therapist_id_fkey(id,display_name,avatar_url,user_id),
  clinic:clinics(id,name,address_line1,city,latitude,longitude,phone),
  family:family_members(full_name)`;

export function useMyBookings() {
  const { session } = useAuth();
  useBookingsRealtime('patient_user_id', session?.user.id);
  return useQuery({
    queryKey: keys.myBookings,
    enabled: !!session,
    queryFn: async () =>
      unwrap(await supabase.from('bookings').select(BOOKING_SELECT).order('scheduled_start', { ascending: false })) as unknown as BookingWithRefs[],
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: keys.booking(id ?? ''),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'on_the_way' ? 15_000 : false),
    queryFn: async () =>
      unwrap(await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id!).maybeSingle()) as unknown as BookingWithRefs | null,
  });
}

export function useBookingHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['booking-history', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(await supabase.from('booking_status_history').select('*').eq('booking_id', id!).order('created_at')) as BookingStatusHistoryRow[],
  });
}

/** Re-fetch bookings the moment the database changes (status updates from the therapist, payments, ...). */
export function useBookingsRealtime(column: 'patient_user_id' | 'therapist_id', value: string | undefined) {
  const qc = useQueryClient();
  // Unique per hook instance: several screens subscribe at once and a shared name would be re-used after subscribe().
  const uid = useRef(Math.random().toString(36).slice(2)).current;
  useEffect(() => {
    if (!value) return;
    const channel = supabase
      .channel(`bookings-${column}-${value}-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `${column}=eq.${value}` }, (payload) => {
        qc.invalidateQueries({ queryKey: ['bookings'] });
        const id = (payload.new as { id?: string } | null)?.id;
        if (id) qc.invalidateQueries({ queryKey: keys.booking(id) });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, column, value, uid]);
}

// ───────────────────────── Quote & create ─────────────────────────
export interface QuoteInput {
  serviceId: string;
  type: AppointmentType;
  startAt?: string | null;
  clinicId?: string | null;
  lat?: number | null;
  lng?: number | null;
  therapistId?: string | null;
  promoCode?: string | null;
  packagePurchaseId?: string | null;
}

export function useQuote(input: QuoteInput | null) {
  return useQuery({
    queryKey: keys.quote(input),
    enabled: !!input,
    staleTime: 0,
    retry: false,
    queryFn: async () =>
      unwrap(await supabase.rpc('quote_booking', {
        p_service_id: input!.serviceId, p_type: input!.type, p_start: input!.startAt ?? null,
        p_clinic_id: input!.clinicId ?? null, p_lat: input!.lat ?? null, p_lng: input!.lng ?? null,
        p_therapist_id: input!.therapistId ?? null, p_promo_code: input!.promoCode || null,
        p_package_purchase_id: input!.packagePurchaseId ?? null,
      })) as BookingQuote,
  });
}

export interface CreateBookingInput extends QuoteInput {
  startAt: string;
  addressId?: string | null;
  familyMemberId?: string | null;
  notes?: string;
  symptoms?: string;
  shareRecords: boolean;
  expectedTotal: number;
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: CreateBookingInput) =>
      unwrap(await supabase.rpc('create_booking', {
        p_service_id: i.serviceId, p_type: i.type, p_start: i.startAt, p_clinic_id: i.clinicId ?? null,
        p_address_id: i.addressId ?? null, p_therapist_id: i.therapistId ?? null,
        p_family_member_id: i.familyMemberId ?? null, p_promo_code: i.promoCode || null,
        p_package_purchase_id: i.packagePurchaseId ?? null, p_notes: i.notes || null,
        p_symptoms: i.symptoms || null, p_share_records: i.shareRecords, p_expected_total: i.expectedTotal,
      })) as BookingRow,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      unwrap(await supabase.rpc('cancel_booking', { p_booking_id: bookingId, p_reason: reason ?? null })) as BookingRow,
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSetRecordSharing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bookingId, share }: { bookingId: string; share: boolean }) => {
      const { error } = await supabase.rpc('set_booking_record_sharing', { p_booking_id: bookingId, p_share: share });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (i: { bookingId: string; therapistId: string; rating: number; comment?: string }) => {
      const { error } = await supabase.from('reviews').insert({
        booking_id: i.bookingId, therapist_id: i.therapistId, patient_user_id: session!.user.id,
        rating: i.rating, comment: i.comment || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useMyReview(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['review', bookingId],
    enabled: !!bookingId,
    queryFn: async () => unwrap(await supabase.from('reviews').select('*').eq('booking_id', bookingId!).maybeSingle()),
  });
}

// ───────────────────────── Payments ─────────────────────────
export function usePayments() {
  return useQuery({
    queryKey: keys.payments,
    queryFn: async () => unwrap(await supabase.from('payments').select('*').order('created_at', { ascending: false })) as PaymentRow[],
  });
}

export function usePaymentForBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['payment-for-booking', bookingId],
    enabled: !!bookingId,
    queryFn: async () =>
      unwrap(await supabase.from('payments').select('*').eq('booking_id', bookingId!).order('created_at', { ascending: false }).limit(1)) as PaymentRow[],
  });
}

export interface CheckoutResult {
  payment: PaymentRow;
  /** URL to open for the provider-hosted checkout, or null when the provider is not configured. */
  checkoutUrl: string | null;
  providerConfigured: boolean;
}

/**
 * 1) create (or reuse) the pending payment row via RPC, 2) ask the server-side Edge Function to open a
 * checkout session with the payment provider. The app NEVER marks anything paid — only the provider
 * webhook (verified signature → confirm_payment, service role) can do that.
 */
export async function startCheckout(args: { bookingId?: string; packageId?: string; method: PaymentMethod }): Promise<CheckoutResult> {
  const payment = args.bookingId
    ? (unwrap(await supabase.rpc('initiate_payment', { p_booking_id: args.bookingId, p_method: args.method })) as PaymentRow)
    : (unwrap(await supabase.rpc('purchase_package', { p_package_id: args.packageId!, p_method: args.method })) as PaymentRow);

  if (payment.provider === 'unconfigured') return { payment, checkoutUrl: null, providerConfigured: false };

  const { data, error } = await supabase.functions.invoke('create-payment-session', { body: { payment_id: payment.id } });
  if (error) throw new Error(error.message);
  return { payment, checkoutUrl: (data as { checkout_url?: string })?.checkout_url ?? null, providerConfigured: true };
}

export const STATUSES_AWAITING_PAYMENT: BookingStatus[] = ['pending'];

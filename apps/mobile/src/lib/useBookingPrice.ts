import { useMemo } from 'react';
import { useQuote } from '@/api/bookings';
import type { BookingDraft } from '@/lib/bookingDraft';

/** Price for the sticky bar: the exact server quote once a time is chosen, otherwise the service fee ("from"). */
export function useRunningPrice(draft: BookingDraft) {
  const { service, type, startAt } = draft;
  const input = useMemo(
    () => (service && type && startAt ? {
      serviceId: service.id, type, startAt,
      clinicId: type === 'clinic' ? draft.clinicId : null,
      lat: type === 'home' ? draft.address?.latitude : null, lng: type === 'home' ? draft.address?.longitude : null,
      therapistId: draft.therapist?.id ?? null, promoCode: draft.promoCode || null, packagePurchaseId: draft.packagePurchaseId,
    } : null),
    [service, type, startAt, draft.clinicId, draft.address, draft.therapist, draft.promoCode, draft.packagePurchaseId],
  );
  const quote = useQuote(input);
  const base = service && type ? Number(type === 'home' ? service.price_home : service.price_clinic) : null;
  if (quote.data) return { amount: Number(quote.data.total_amount), exact: true, quote: quote.data };
  return { amount: base != null && !Number.isNaN(base) ? base : null, exact: false, quote: null };
}

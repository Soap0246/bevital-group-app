import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { toKlDateString, type AddressRow, type AppointmentType, type ServiceRow } from '@bevital/shared';

export interface BookingDraft {
  service: ServiceRow | null;
  type: AppointmentType | null;
  /** null = booking for myself */
  familyMemberId: string | null;
  familyMemberName: string | null;
  clinicId: string | null;
  clinicName: string | null;
  address: AddressRow | null;
  date: string;
  startAt: string | null;
  /** null = automatic matching */
  therapist: { id: string; name: string } | null;
  /** therapist chosen from their profile; pre-selected in step 5 */
  preferredTherapistId: string | null;
  promoCode: string;
  packagePurchaseId: string | null;
  notes: string;
  symptoms: string;
  shareRecords: boolean;
  bookingId: string | null;
}

const initial = (): BookingDraft => ({
  service: null, type: null, familyMemberId: null, familyMemberName: null, clinicId: null, clinicName: null, address: null,
  date: toKlDateString(), startAt: null, therapist: null, preferredTherapistId: null, promoCode: '', packagePurchaseId: null,
  notes: '', symptoms: '', shareRecords: false, bookingId: null,
});

interface Ctx {
  draft: BookingDraft;
  update: (patch: Partial<BookingDraft>) => void;
  reset: (patch?: Partial<BookingDraft>) => void;
}
const DraftContext = createContext<Ctx | null>(null);

/** Keys whose change invalidates the chosen time/therapist (availability depends on them). */
const AVAILABILITY_KEYS: Array<keyof BookingDraft> = ['service', 'type', 'clinicId', 'address', 'date'];

export function BookingDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<BookingDraft>(initial);
  const update = useCallback((patch: Partial<BookingDraft>) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      const dependentChanged = AVAILABILITY_KEYS.some((k) => k in patch && patch[k] !== d[k]);
      if (dependentChanged && !('startAt' in patch)) next.startAt = null;
      if (dependentChanged && !('therapist' in patch)) next.therapist = null;
      return next;
    });
  }, []);
  const reset = useCallback((patch?: Partial<BookingDraft>) => setDraft({ ...initial(), ...patch }), []);
  const value = useMemo(() => ({ draft, update, reset }), [draft, update, reset]);
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useBookingDraft() {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useBookingDraft must be used inside the booking flow');
  return ctx;
}

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Central query keys so mutations can invalidate precisely. */
export const keys = {
  categories: ['categories'] as const,
  services: (categoryId?: string | null) => ['services', categoryId ?? 'all'] as const,
  service: (slug: string) => ['service', slug] as const,
  clinics: ['clinics'] as const,
  settings: ['settings'] as const,
  therapist: (id: string) => ['therapist', id] as const,
  availableTimes: (p: unknown) => ['available-times', p] as const,
  availableTherapists: (p: unknown) => ['available-therapists', p] as const,
  quote: (p: unknown) => ['quote', p] as const,
  myBookings: ['bookings', 'mine'] as const,
  booking: (id: string) => ['booking', id] as const,
  therapistBookings: ['bookings', 'therapist'] as const,
  notifications: ['notifications'] as const,
  medicalRecords: (familyId: string | null) => ['medical-records', familyId ?? 'self'] as const,
  patientProfile: ['patient-profile'] as const,
  family: ['family'] as const,
  addresses: ['addresses'] as const,
  payments: ['payments'] as const,
  packages: ['packages'] as const,
  myPackages: ['my-packages'] as const,
  promotions: ['promotions'] as const,
  articles: ['articles'] as const,
  recovery: (familyId: string | null) => ['recovery', familyId ?? 'self'] as const,
  earnings: ['earnings'] as const,
  availability: ['availability'] as const,
  credentials: ['credentials'] as const,
};

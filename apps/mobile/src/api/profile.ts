import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddressRow, FamilyMemberRow, MedicalRecordRow, NotificationRow, PackagePurchaseRow, PackageRow, PatientProfileRow, UserRow,
} from '@bevital/shared';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/lib/query';
import { useAuth } from '@/lib/auth';
import { unwrap } from './catalog';

// ───────────────────────── Patient profile ─────────────────────────
export function usePatientProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: keys.patientProfile,
    enabled: !!session,
    queryFn: async () => unwrap(await supabase.from('patient_profiles').select('*').eq('user_id', session!.user.id).maybeSingle()) as PatientProfileRow | null,
  });
}

export function useUpdatePatientProfile() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<PatientProfileRow, 'user_id'>>) => {
      const { error } = await supabase.from('patient_profiles').update(patch).eq('user_id', session!.user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.patientProfile }),
  });
}

export function useUpdateAccount() {
  const { refreshProfile, session } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<UserRow, 'full_name' | 'phone' | 'avatar_url' | 'preferred_language'>>) => {
      const { error } = await supabase.from('users').update(patch).eq('id', session!.user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshProfile(),
  });
}

// ───────────────────────── Medical records (owner only) ─────────────────────────
export function useMedicalRecords(familyId: string | null) {
  return useQuery({
    queryKey: keys.medicalRecords(familyId),
    queryFn: async () => {
      let q = supabase.from('patient_medical_records').select('*').eq('is_active', true).order('record_type').order('created_at', { ascending: false });
      q = familyId ? q.eq('family_member_id', familyId) : q.is('family_member_id', null);
      return unwrap(await q) as MedicalRecordRow[];
    },
  });
}

export function useSaveMedicalRecord() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (i: { id?: string; familyId: string | null; record: Pick<MedicalRecordRow, 'record_type' | 'title'> & Partial<MedicalRecordRow> }) => {
      const row = { ...i.record, patient_user_id: session!.user.id, family_member_id: i.familyId };
      const res = i.id
        ? await supabase.from('patient_medical_records').update(row).eq('id', i.id)
        : await supabase.from('patient_medical_records').insert(row);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-records'] }),
  });
}

export function useDeleteMedicalRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('patient_medical_records').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-records'] }),
  });
}

// ───────────────────────── Family ─────────────────────────
export function useFamily() {
  return useQuery({
    queryKey: keys.family,
    queryFn: async () => unwrap(await supabase.from('family_members').select('*').eq('is_active', true).order('created_at')) as FamilyMemberRow[],
  });
}

export function useSaveFamilyMember() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (i: { id?: string; data: Pick<FamilyMemberRow, 'full_name' | 'relationship' | 'consent_basis'> & Partial<FamilyMemberRow> }) => {
      const row = { ...i.data, primary_user_id: session!.user.id, consent_granted_at: i.data.consent_basis ? (i.data.consent_granted_at ?? new Date().toISOString()) : null };
      const res = i.id ? await supabase.from('family_members').update(row).eq('id', i.id) : await supabase.from('family_members').insert(row);
      if (res.error) throw new Error(res.error.message);
      if (!i.id) {
        await supabase.from('consents').insert({ user_id: session!.user.id, consent_type: 'family_proxy' });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.family }),
  });
}

export function useRemoveFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // soft-remove: bookings and clinical history must be retained
      const { error } = await supabase.from('family_members').update({ is_active: false }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.family }),
  });
}

// ───────────────────────── Addresses ─────────────────────────
export function useAddresses() {
  return useQuery({
    queryKey: keys.addresses,
    queryFn: async () => unwrap(await supabase.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at')) as AddressRow[],
  });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (i: { id?: string; data: Omit<AddressRow, 'id' | 'user_id' | 'country' | 'place_id'> & { place_id?: string | null } }) => {
      const uid = session!.user.id;
      if (i.data.is_default) await supabase.from('addresses').update({ is_default: false }).eq('user_id', uid).eq('is_default', true);
      const row = { ...i.data, user_id: uid };
      const res = i.id ? await supabase.from('addresses').update(row).eq('id', i.id) : await supabase.from('addresses').insert(row);
      if (res.error) throw new Error(res.error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('addresses').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.addresses }),
  });
}

// ───────────────────────── Packages ─────────────────────────
export function usePackages() {
  return useQuery({
    queryKey: keys.packages,
    queryFn: async () => unwrap(await supabase.from('packages').select('*').order('sort_order')) as PackageRow[],
  });
}

export function useMyPackages() {
  return useQuery({
    queryKey: keys.myPackages,
    queryFn: async () =>
      unwrap(await supabase.from('package_purchases').select('*, package:packages(name, service_id)').order('created_at', { ascending: false })) as unknown as Array<PackagePurchaseRow & { package: { name: string; service_id: string | null } | null }>,
  });
}

// ───────────────────────── Notifications ─────────────────────────
export function useNotifications() {
  const qc = useQueryClient();
  const { session } = useAuth();
  useEffect(() => {
    if (!session) return;
    const ch = supabase
      .channel(`notifications-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => {
        qc.invalidateQueries({ queryKey: keys.notifications });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, session]);

  return useQuery({
    queryKey: keys.notifications,
    enabled: !!session,
    queryFn: async () =>
      unwrap(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)) as NotificationRow[],
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      if (ids?.length) q = q.in('id', ids);
      const { error } = await q;
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

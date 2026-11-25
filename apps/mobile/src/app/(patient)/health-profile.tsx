import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { RECORD_TYPES, RECORD_TYPE_LABELS, ageFromDob, emergencyContactSchema, formatDate, friendlyError, type MedicalRecordRow, type RecordType } from '@bevital/shared';
import { useDeleteMedicalRecord, useFamily, useMedicalRecords, usePatientProfile, useSaveMedicalRecord, useUpdatePatientProfile } from '@/api/profile';
import { Banner, Button, Card, Chip, ChipRow, EmptyState, Icon, Input, LoadingList, Screen, SectionHeader, Sheet, Text, useToast, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { uploadPrivateFile } from '@/lib/upload';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

const TYPE_ICON: Record<RecordType, IconName> = {
  medical_history: 'document-text-outline', condition: 'fitness-outline', injury: 'bandage-outline', allergy: 'alert-circle-outline',
  surgery: 'cut-outline', medication: 'medkit-outline', symptom: 'pulse-outline', document: 'attach-outline',
};

const GENDERS = [['female', 'Female'], ['male', 'Male'], ['other', 'Other'], ['prefer_not_to_say', 'Prefer not to say']] as const;

/** Secure patient health profile. Only the account owner can read it; physiotherapists see it only with consent, via an audited function. */
export default function HealthProfile() {
  const toast = useToast();
  const { session } = useAuth();
  const family = useFamily();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const profile = usePatientProfile();
  const updateProfile = useUpdatePatientProfile();
  const records = useMedicalRecords(familyId);
  const save = useSaveMedicalRecord();
  const remove = useDeleteMedicalRecord();

  const [editing, setEditing] = useState<{ id?: string; type: RecordType; title: string; description: string; severity: string; onset: string; doc?: { uri: string; name: string; mimeType?: string } } | null>(null);
  const [personal, setPersonal] = useState<{ dob: string; gender: string; occupation: string; ecName: string; ecPhone: string; ecRel: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const p = profile.data;
  const openPersonal = () => setPersonal({ dob: p?.date_of_birth ?? '', gender: p?.gender ?? '', occupation: p?.occupation ?? '', ecName: p?.emergency_contact_name ?? '', ecPhone: p?.emergency_contact_phone ?? '', ecRel: p?.emergency_contact_relationship ?? '' });

  const savePersonal = async () => {
    if (!personal) return;
    setErr(null);
    if (personal.dob && !/^\d{4}-\d{2}-\d{2}$/.test(personal.dob)) { setErr('Date of birth must be YYYY-MM-DD'); return; }
    let ec: { name: string; phone: string; relationship: string } | null = null;
    if (personal.ecName || personal.ecPhone || personal.ecRel) {
      const r = emergencyContactSchema.safeParse({ name: personal.ecName, phone: personal.ecPhone, relationship: personal.ecRel });
      if (!r.success) { setErr(r.error.issues[0]?.message ?? 'Check the emergency contact'); return; }
      ec = r.data;
    }
    try {
      await updateProfile.mutateAsync({
        date_of_birth: personal.dob || null, gender: (personal.gender || null) as never, occupation: personal.occupation || null,
        emergency_contact_name: ec?.name ?? null, emergency_contact_phone: ec?.phone ?? null, emergency_contact_relationship: ec?.relationship ?? null,
      });
      setPersonal(null); toast.show('Saved');
    } catch (e) { setErr(friendlyError(e)); }
  };

  const pickDoc = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    if (a.size && a.size > 10 * 1024 * 1024) { setErr('Files must be 10 MB or smaller'); return; }
    setEditing((e) => (e ? { ...e, doc: { uri: a.uri, name: a.name, mimeType: a.mimeType }, title: e.title || a.name } : e));
  };

  const saveRecord = async () => {
    if (!editing) return;
    setErr(null);
    if (editing.title.trim().length < 2) { setErr('Add a short title'); return; }
    if (editing.type === 'document' && !editing.doc && !editing.id) { setErr('Choose a file to upload'); return; }
    try {
      let document_path: string | undefined;
      if (editing.doc) document_path = await uploadPrivateFile('medical-documents', session!.user.id, editing.doc, familyId ?? 'self');
      await save.mutateAsync({
        id: editing.id, familyId,
        record: {
          record_type: editing.type, title: editing.title.trim(), description: editing.description.trim() || null,
          severity: (editing.severity || null) as MedicalRecordRow['severity'], onset_date: editing.onset || null, ...(document_path ? { document_path } : {}),
        },
      });
      setEditing(null); toast.show('Saved');
    } catch (e) { setErr(friendlyError(e)); }
  };

  const openDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from('medical-documents').createSignedUrl(path, 60);
    if (error || !data) { toast.show('Could not open the document', 'error'); return; }
    const { Linking } = await import('react-native');
    await Linking.openURL(data.signedUrl);
  };

  const byType = new Map<RecordType, MedicalRecordRow[]>();
  for (const r of records.data ?? []) byType.set(r.record_type, [...(byType.get(r.record_type) ?? []), r]);
  const age = ageFromDob(p?.date_of_birth);

  return (
    <Screen title="Health profile">
      <Banner tone="info" icon="lock-closed-outline" title="Private to you" body="Only you can see this. A physiotherapist can read it only for appointments where you choose to share it, and every access is logged." />
      {(family.data ?? []).length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <ChipRow>
            <Chip label="Me" icon="person" selected={!familyId} onPress={() => setFamilyId(null)} />
            {(family.data ?? []).map((m) => <Chip key={m.id} label={m.full_name} icon="people" selected={familyId === m.id} onPress={() => setFamilyId(m.id)} />)}
          </ChipRow>
        </View>
      ) : null}

      {!familyId ? (
        <>
          <SectionHeader title="Personal information" action="Edit" onAction={openPersonal} />
          <Card>
            {profile.isLoading ? <LoadingList count={1} /> : (
              <View style={{ gap: 8 }}>
                <Text>Date of birth: <Text variant="bodyStrong">{p?.date_of_birth ? `${formatDate(p.date_of_birth)}${age != null ? ` (${age})` : ''}` : 'Not set'}</Text></Text>
                <Text>Gender: <Text variant="bodyStrong">{GENDERS.find(([v]) => v === p?.gender)?.[1] ?? 'Not set'}</Text></Text>
                <Text>Occupation: <Text variant="bodyStrong">{p?.occupation ?? 'Not set'}</Text></Text>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
                <Text variant="label" color="textMuted">EMERGENCY CONTACT</Text>
                <Text variant="bodyStrong">{p?.emergency_contact_name ? `${p.emergency_contact_name} (${p.emergency_contact_relationship ?? ''})` : 'Not set'}</Text>
                {p?.emergency_contact_phone ? <Text color="textMuted">{p.emergency_contact_phone}</Text> : null}
              </View>
            )}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Medical information" action="Add" onAction={() => setEditing({ type: 'condition', title: '', description: '', severity: '', onset: '' })} />
      {records.isLoading ? <LoadingList count={2} /> : (records.data ?? []).length === 0 ? (
        <EmptyState icon="heart-outline" title="Nothing added yet" body="Add conditions, injuries, allergies, surgeries or documents so your physiotherapist can treat you safely." actionLabel="Add information" onAction={() => setEditing({ type: 'condition', title: '', description: '', severity: '', onset: '' })} />
      ) : (
        RECORD_TYPES.filter((t) => byType.has(t)).map((t) => (
          <View key={t} style={{ marginBottom: 12, gap: 8 }}>
            <Text variant="label" color="textMuted">{RECORD_TYPE_LABELS[t].toUpperCase()}</Text>
            {byType.get(t)!.map((r) => (
              <Card key={r.id} onPress={() => setEditing({ id: r.id, type: r.record_type, title: r.title, description: r.description ?? '', severity: r.severity ?? '', onset: r.onset_date ?? '' })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Icon name={TYPE_ICON[t]} size={22} color="primary" />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{r.title}</Text>
                    {r.description ? <Text variant="caption" color="textMuted" numberOfLines={2}>{r.description}</Text> : null}
                    {r.severity ? <Text variant="caption" color="textSubtle">Severity: {r.severity}</Text> : null}
                  </View>
                  {r.document_path ? <Pressable onPress={() => openDoc(r.document_path!)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Open document"><Icon name="open-outline" size={22} color="primary" /></Pressable> : null}
                </View>
              </Card>
            ))}
          </View>
        ))
      )}

      <Sheet visible={!!personal} onClose={() => setPersonal(null)} title="Personal information" footer={<Button label="Save" loading={updateProfile.isPending} onPress={savePersonal} />}>
        {err ? <Text color="danger">{err}</Text> : null}
        {personal ? (
          <>
            <Input label="Date of birth" value={personal.dob} onChangeText={(t) => setPersonal({ ...personal, dob: t })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
            <ChipRow>{GENDERS.map(([v, l]) => <Chip key={v} label={l} selected={personal.gender === v} onPress={() => setPersonal({ ...personal, gender: v })} />)}</ChipRow>
            <Input label="Occupation" value={personal.occupation} onChangeText={(t) => setPersonal({ ...personal, occupation: t })} />
            <Text variant="subheading">Emergency contact</Text>
            <Input label="Name" value={personal.ecName} onChangeText={(t) => setPersonal({ ...personal, ecName: t })} />
            <Input label="Phone" value={personal.ecPhone} onChangeText={(t) => setPersonal({ ...personal, ecPhone: t })} keyboardType="phone-pad" />
            <Input label="Relationship" value={personal.ecRel} onChangeText={(t) => setPersonal({ ...personal, ecRel: t })} placeholder="e.g. Spouse" />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={!!editing} onClose={() => { setEditing(null); setErr(null); }} title={editing?.id ? 'Edit information' : 'Add information'}
        footer={
          <>
            <Button label="Save" loading={save.isPending} onPress={saveRecord} />
            {editing?.id ? <Button label="Delete" variant="danger" loading={remove.isPending} onPress={async () => { await remove.mutateAsync(editing.id!); setEditing(null); toast.show('Deleted'); }} /> : null}
          </>
        }>
        {err ? <Text color="danger">{err}</Text> : null}
        {editing ? (
          <>
            <ChipRow>{RECORD_TYPES.map((t) => <Chip key={t} label={RECORD_TYPE_LABELS[t]} selected={editing.type === t} onPress={() => setEditing({ ...editing, type: t })} />)}</ChipRow>
            <Input label="Title" value={editing.title} onChangeText={(t) => setEditing({ ...editing, title: t })} placeholder="e.g. Penicillin allergy" />
            <Input label="Details (optional)" multiline value={editing.description} onChangeText={(t) => setEditing({ ...editing, description: t })} />
            {editing.type !== 'document' && editing.type !== 'allergy' ? (
              <>
                <Text variant="label" color="inkSoft">SEVERITY</Text>
                <ChipRow>{['mild', 'moderate', 'severe'].map((s) => <Chip key={s} label={s[0]!.toUpperCase() + s.slice(1)} selected={editing.severity === s} onPress={() => setEditing({ ...editing, severity: editing.severity === s ? '' : s })} />)}</ChipRow>
                <Input label="Since (optional)" value={editing.onset} onChangeText={(t) => setEditing({ ...editing, onset: t })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
              </>
            ) : null}
            {editing.type === 'document' ? (
              <Button label={editing.doc ? `Selected: ${editing.doc.name}` : 'Choose PDF or photo'} variant="secondary" icon="attach" onPress={pickDoc} />
            ) : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

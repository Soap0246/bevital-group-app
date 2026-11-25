import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { CONSENT_BASES, RELATIONSHIPS, ageFromDob, familyMemberSchema, friendlyError, formatDate, type ConsentBasis, type FamilyMemberRow, type Relationship } from '@bevital/shared';
import { useFamily, useRemoveFamilyMember, useSaveFamilyMember } from '@/api/profile';
import { Banner, Button, Card, Chip, ChipRow, EmptyState, Icon, Input, LoadingList, Row, Screen, Sheet, Text, useToast } from '@/components/ui';
import { colors } from '@/theme';

const BASIS_LABEL: Record<ConsentBasis, { title: string; body: string }> = {
  guardian_of_minor: { title: "I'm their parent or legal guardian", body: 'For children under 18.' },
  authorised_representative: { title: "I'm their authorised representative", body: 'For an adult who is unable to manage their own care (e.g. elderly parent) — I have their authority to act.' },
  adult_consented: { title: 'They have agreed to me booking for them', body: 'For a capable adult who has given you permission.' },
};

interface Draft { id?: string; fullName: string; relationship: Relationship; dob: string; gender: string; basis: ConsentBasis | ''; confirmed: boolean }
const empty: Draft = { fullName: '', relationship: 'child', dob: '', gender: '', basis: '', confirmed: false };

/** Family accounts: manage and book for dependants. A recorded consent is required before any booking. */
export default function Family() {
  const toast = useToast();
  const family = useFamily();
  const save = useSaveFamilyMember();
  const remove = useRemoveFamilyMember();
  const [d, setD] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!d) return;
    setErr(null);
    const parsed = familyMemberSchema.safeParse({ fullName: d.fullName, relationship: d.relationship, dateOfBirth: d.dob, gender: d.gender || undefined, consentBasis: d.basis || undefined });
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Check the details'); return; }
    if (!d.confirmed) { setErr('Please confirm you are authorised to manage this profile'); return; }
    try {
      await save.mutateAsync({ id: d.id, data: { full_name: parsed.data.fullName, relationship: parsed.data.relationship, date_of_birth: parsed.data.dateOfBirth || null, gender: (parsed.data.gender ?? null) as never, consent_basis: parsed.data.consentBasis } });
      setD(null); toast.show('Family member saved');
    } catch (e) { setErr(friendlyError(e)); }
  };

  const edit = (m: FamilyMemberRow) => setD({ id: m.id, fullName: m.full_name, relationship: m.relationship, dob: m.date_of_birth ?? '', gender: m.gender ?? '', basis: m.consent_basis ?? '', confirmed: true });

  return (
    <Screen title="Family accounts" right={<Button label="Add" icon="add" size="md" fullWidth={false} onPress={() => { setErr(null); setD(empty); }} />}>
      <Banner tone="info" icon="shield-checkmark-outline" title="You stay in control" body="Family profiles are managed from your account. Their health information is private to you and shared with a physiotherapist only when you choose." />
      <View style={{ gap: 12, marginTop: 16 }}>
        {family.isLoading ? <LoadingList count={2} /> : (family.data ?? []).length === 0 ? (
          <EmptyState icon="people-outline" title="No family members yet" body="Add a child, parent, spouse or other loved one to book and track care for them." actionLabel="Add family member" onAction={() => setD(empty)} />
        ) : (family.data ?? []).map((m) => (
          <Card key={m.id} onPress={() => edit(m)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name="people-circle-outline" size={40} color="primary" />
              <View style={{ flex: 1 }}>
                <Text variant="subheading">{m.full_name}</Text>
                <Text variant="caption" color="textMuted">{m.relationship[0]!.toUpperCase() + m.relationship.slice(1)}{m.date_of_birth ? ` · ${ageFromDob(m.date_of_birth)} yrs` : ''}</Text>
                <Text variant="caption" color={m.consent_granted_at ? 'success' : 'danger'}>{m.consent_granted_at ? `Consent recorded ${formatDate(m.consent_granted_at)}` : 'Consent needed before booking'}</Text>
              </View>
              <Icon name="chevron-forward" size={20} color="textSubtle" />
            </View>
          </Card>
        ))}
      </View>

      <Sheet visible={!!d} onClose={() => setD(null)} title={d?.id ? 'Edit family member' : 'Add family member'}
        footer={<><Button label="Save" loading={save.isPending} onPress={submit} />{d?.id ? <Button label="Remove from my account" variant="danger" onPress={async () => { await remove.mutateAsync(d.id!); setD(null); toast.show('Removed'); }} /> : null}</>}>
        {err ? <Text color="danger">{err}</Text> : null}
        {d ? (
          <>
            <Input label="Full name" value={d.fullName} onChangeText={(t) => setD({ ...d, fullName: t })} />
            <ChipRow>{RELATIONSHIPS.map((r) => <Chip key={r} label={r[0]!.toUpperCase() + r.slice(1)} selected={d.relationship === r} onPress={() => setD({ ...d, relationship: r })} />)}</ChipRow>
            <Input label="Date of birth" value={d.dob} onChangeText={(t) => setD({ ...d, dob: t })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
            <Text variant="subheading">Your authority</Text>
            {CONSENT_BASES.map((b) => (
              <Card key={b} onPress={() => setD({ ...d, basis: b })} style={d.basis === b ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
                <Row title={BASIS_LABEL[b].title} subtitle={BASIS_LABEL[b].body} right={<Icon name={d.basis === b ? 'radio-button-on' : 'radio-button-off'} size={22} color={d.basis === b ? 'primary' : 'textSubtle'} />} last />
              </Card>
            ))}
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Switch value={d.confirmed} onValueChange={(v) => setD({ ...d, confirmed: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} />
              <Text style={{ flex: 1 }}>I confirm I am authorised to book healthcare and manage health information for this person, and I consent to BeVital processing it for their care.</Text>
            </View>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

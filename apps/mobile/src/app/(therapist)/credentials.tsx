import React, { useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { CREDENTIAL_TYPES, CREDENTIAL_TYPE_LABELS, VERIFICATION_LABELS, credentialSchema, formatDate, friendlyError, type CredentialType, type StatusTone } from '@bevital/shared';
import { useCredentials, useSubmitCredential } from '@/api/therapist';
import { Badge, Banner, Button, Card, Chip, ChipRow, EmptyState, Input, LoadingList, Screen, SectionHeader, Sheet, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const TONE: Record<string, StatusTone> = { submitted: 'info', approved: 'success', rejected: 'danger', expired: 'warning' };

/** Credential submission & verification status. Documents go to a private bucket visible only to you and BeVital admins. */
export default function Credentials() {
  const toast = useToast();
  const { therapist, refreshProfile } = useAuth();
  const list = useCredentials();
  const submit = useSubmitCredential();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<{ type: CredentialType; title: string; issuer: string; number: string; expires: string; file?: { uri: string; name: string; mimeType?: string } }>({ type: 'annual_practising_certificate', title: '', issuer: '', number: '', expires: '' });
  const [err, setErr] = useState<string | null>(null);
  const status = therapist?.verification_status ?? 'pending';

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    if (a.size && a.size > 10 * 1024 * 1024) { setErr('Files must be 10 MB or smaller'); return; }
    setF((c) => ({ ...c, file: { uri: a.uri, name: a.name, mimeType: a.mimeType } }));
  };

  const send = async () => {
    setErr(null);
    const parsed = credentialSchema.safeParse({ credentialType: f.type, title: f.title || CREDENTIAL_TYPE_LABELS[f.type], issuer: f.issuer, credentialNumber: f.number, expiresOn: f.expires });
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Check the details'); return; }
    if (!f.file) { setErr('Attach a clear copy of the document (PDF or photo)'); return; }
    try {
      await submit.mutateAsync({ type: f.type, title: parsed.data.title, issuer: f.issuer, number: parsed.data.credentialNumber, expiresOn: parsed.data.expiresOn || undefined, file: f.file });
      setOpen(false); setF({ type: 'annual_practising_certificate', title: '', issuer: '', number: '', expires: '' }); toast.show('Submitted for review'); void refreshProfile();
    } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <Screen title="Credentials" subtitle={`Verification: ${VERIFICATION_LABELS[status]}`} footer={<Button label="Submit a credential" icon="add" onPress={() => { setErr(null); setOpen(true); }} />}>
      {status === 'verified' ? <Banner tone="success" icon="shield-checkmark" title="You're verified" body="Patients can find and book you." />
        : status === 'rejected' || status === 'suspended' ? <Banner tone="danger" icon="alert-circle" title={`Verification ${status}`} body="Please contact BeVital support or resubmit corrected documents." />
        : <Banner tone="warning" icon="shield-outline" title="Verification required" body="Submit your professional registration, annual practising certificate and degree. A BeVital administrator reviews each document before you can receive bookings." />}
      <SectionHeader title="Submitted documents" />
      {list.isLoading ? <LoadingList count={2} /> : (list.data ?? []).length === 0 ? <EmptyState icon="document-attach-outline" title="Nothing submitted yet" body="Start with your professional registration and annual practising certificate." /> : (
        <View style={{ gap: 10 }}>
          {(list.data ?? []).map((c) => (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}><Text variant="bodyStrong">{c.title}</Text><Text variant="caption" color="textMuted">{CREDENTIAL_TYPE_LABELS[c.credential_type]}{c.credential_number ? ` · ${c.credential_number}` : ''}</Text></View>
                <Badge label={c.status} tone={TONE[c.status] ?? 'neutral'} />
              </View>
              {c.expires_on ? <Text variant="caption" color="textSubtle" style={{ marginTop: 4 }}>Expires {formatDate(c.expires_on)}</Text> : null}
              {c.review_notes ? <Banner tone={c.status === 'rejected' ? 'danger' : 'info'} icon="chatbubble-ellipses-outline" title="Reviewer note" body={c.review_notes} /> : null}
            </Card>
          ))}
        </View>
      )}

      <Sheet visible={open} onClose={() => setOpen(false)} title="Submit a credential" footer={<Button label="Submit for review" loading={submit.isPending} onPress={send} />}>
        {err ? <Text color="danger">{err}</Text> : null}
        <ChipRow>{CREDENTIAL_TYPES.map((t) => <Chip key={t} label={CREDENTIAL_TYPE_LABELS[t]} selected={f.type === t} onPress={() => setF({ ...f, type: t })} />)}</ChipRow>
        <Input label="Title" value={f.title} onChangeText={(t) => setF({ ...f, title: t })} placeholder={CREDENTIAL_TYPE_LABELS[f.type]} />
        <Input label="Issued by" value={f.issuer} onChangeText={(t) => setF({ ...f, issuer: t })} />
        <Input label="Registration / certificate number" value={f.number} onChangeText={(t) => setF({ ...f, number: t })} autoCapitalize="characters" />
        <Input label="Expiry date (if any)" value={f.expires} onChangeText={(t) => setF({ ...f, expires: t })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        <Button label={f.file ? `Attached: ${f.file.name}` : 'Attach PDF or photo'} variant="secondary" icon="attach" onPress={pick} />
      </Sheet>
    </Screen>
  );
}

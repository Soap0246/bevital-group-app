import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  APPOINTMENT_TYPE_LABELS, RECORD_TYPE_LABELS, formatDate, formatTime, friendlyError, nextStatusesFor, type BookingStatus,
} from '@bevital/shared';
import {
  useRespondToBooking, useSaveNote, useSaveSession, useSessionForBooking, useShareLiveLocation, useTherapistBooking, usePatientHealth, useUpdateBookingStatus,
} from '@/api/therapist';
import { StatusTimeline } from '@/components/domain/booking';
import { Banner, Button, Card, EmptyState, ErrorState, Icon, Input, LoadingList, Row, Screen, SectionHeader, Sheet, StatusBadge, Text, useToast } from '@/components/ui';
import { useBookingHistory } from '@/api/bookings';
import { useAuth } from '@/lib/auth';
import { colors, radius } from '@/theme';

const ACTION: Partial<Record<BookingStatus, { label: string; icon: React.ComponentProps<typeof Icon>['name'] }>> = {
  on_the_way: { label: "I'm on my way", icon: 'navigate' },
  arrived: { label: "I've arrived", icon: 'location' },
  treatment_in_progress: { label: 'Start treatment', icon: 'play' },
  completed: { label: 'Complete session', icon: 'checkmark-done' },
};

function PainPicker({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {Array.from({ length: 11 }, (_, n) => (
        <Pressable key={n} onPress={() => onChange(value === n ? null : n)} accessibilityRole="button" accessibilityState={{ selected: value === n }} accessibilityLabel={`Pain ${n}`}
          style={{ width: 42, height: 42, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: value === n ? colors.primary : colors.surfaceAlt }}>
          <Text variant="bodyStrong" color={value === n ? 'surface' : 'ink'}>{n}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Therapist's view of a single visit: patient details, status actions, health profile (consent-gated, audited) and documentation. */
export default function Visit() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { therapist } = useAuth();
  const q = useTherapistBooking(id);
  const history = useBookingHistory(id);
  const respond = useRespondToBooking();
  const update = useUpdateBookingStatus();
  const session = useSessionForBooking(id);
  const saveSession = useSaveSession();
  const saveNote = useSaveNote();
  const b = q.data;
  const [showHealth, setShowHealth] = useState(false);
  const health = usePatientHealth(id, showHealth);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState({ s: '', o: '', a: '', p: '', summary: '', share: false });
  const [pain, setPain] = useState<{ before: number | null; after: number | null }>({ before: null, after: null });

  // Real GPS is published only while "on the way".
  useShareLiveLocation(id, therapist?.id, b?.status === 'on_the_way' && b.appointment_type === 'home');

  useEffect(() => {
    if (session.data) setPain({ before: session.data.pain_score_before, after: session.data.pain_score_after });
  }, [session.data]);

  if (q.isLoading) return <Screen title="Appointment"><LoadingList /></Screen>;
  if (q.isError) return <Screen title="Appointment"><ErrorState error={q.error} onRetry={() => q.refetch()} /></Screen>;
  if (!b) return <Screen title="Appointment"><EmptyState title="Not found" /></Screen>;

  const next = nextStatusesFor(b.status, 'therapist', b.appointment_type);
  const forward = next.filter((s) => s !== 'cancelled');
  const canCancel = next.includes('cancelled');
  const patientName = b.family?.full_name ?? b.patient?.full_name ?? 'Patient';
  const documenting = ['arrived', 'treatment_in_progress', 'completed'].includes(b.status);
  const hasLoc = b.visit_latitude != null && b.visit_longitude != null;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.show(ok); } catch (e) { toast.show(friendlyError(e), 'error'); }
  };

  return (
    <Screen title={patientName} subtitle={b.service?.name} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 }}>
        <StatusBadge status={b.status} />
        <Text variant="caption" color="textMuted">{b.reference}</Text>
      </View>

      {b.status === 'awaiting_confirmation' ? (
        <Card tone="tinted" style={{ gap: 10 }}>
          <Text variant="bodyStrong">Accept this booking?</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Decline" variant="danger" size="md" onPress={() => setCancelOpen(true)} /></View>
            <View style={{ flex: 1 }}><Button label="Accept" icon="checkmark" size="md" loading={respond.isPending} onPress={() => run(() => respond.mutateAsync({ bookingId: b.id, accept: true }), 'Booking accepted')} /></View>
          </View>
        </Card>
      ) : null}

      {forward.length > 0 ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          {forward.map((s) => (
            <Button key={s} label={ACTION[s]?.label ?? s} icon={ACTION[s]?.icon} loading={update.isPending}
              onPress={() => run(() => update.mutateAsync({ bookingId: b.id, status: s }), 'Status updated')} />
          ))}
        </View>
      ) : null}
      {b.status === 'on_the_way' ? <Banner tone="info" icon="navigate-outline" title="Sharing your live location" body="While you're on the way, your phone's GPS position is shared with the patient. It stops when you mark 'arrived'." /> : null}

      <SectionHeader title="When & where" />
      <Card>
        <Row icon="calendar-outline" title={formatDate(b.scheduled_start)} subtitle={`${formatTime(b.scheduled_start)} – ${formatTime(b.scheduled_end)}`} />
        <Row icon={b.appointment_type === 'home' ? 'home-outline' : 'business-outline'} title={APPOINTMENT_TYPE_LABELS[b.appointment_type]}
          subtitle={b.appointment_type === 'home' ? (b.visit_address_text ?? undefined) : (b.clinic ? `${b.clinic.name}, ${b.clinic.address_line1}` : undefined)} last={!hasLoc && !b.visit_notes} />
        {b.visit_notes ? <Row icon="key-outline" title="Access notes" subtitle={b.visit_notes} last={!hasLoc} /> : null}
        {hasLoc ? <Row icon="navigate-outline" title="Navigate to patient" subtitle="Opens your maps app" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${b.visit_latitude},${b.visit_longitude}`)} last /> : null}
      </Card>

      <SectionHeader title="Patient" />
      <Card>
        <Row icon="person-outline" title={patientName} subtitle={b.family ? `Booked by ${b.patient?.full_name}` : undefined} />
        {b.patient?.phone ? <Row icon="call-outline" title={b.patient.phone} subtitle="Tap to call" onPress={() => Linking.openURL(`tel:${b.patient!.phone}`)} /> : null}
        <Row icon="document-text-outline" title="Reported symptoms" subtitle={b.symptoms ?? 'None provided'} />
        <Row icon="chatbubble-outline" title="Patient notes" subtitle={b.patient_notes ?? 'None'} last />
      </Card>

      <SectionHeader title="Health profile" />
      {!b.share_records_consent ? (
        <Banner tone="neutral" icon="lock-closed-outline" title="Not shared by the patient" body="You can see their health profile only if they choose to share it for this appointment." />
      ) : !showHealth ? (
        <Button label="View health profile" icon="eye-outline" variant="secondary" onPress={() => setShowHealth(true)} accessibilityHint="Opens the patient's medical information. This access is logged." />
      ) : health.isLoading ? <LoadingList count={1} /> : health.isError ? <ErrorState error={health.error} title="Couldn't open the health profile" /> : health.data ? (
        <Card style={{ gap: 6 }}>
          <Banner tone="info" icon="eye-outline" title="This access has been logged" />
          {health.data.records.length === 0 ? <Text color="textMuted">The patient hasn't added any medical information.</Text> : health.data.records.map((r) => (
            <Row key={r.id} icon="medical-outline" title={r.title} subtitle={`${RECORD_TYPE_LABELS[r.record_type]}${r.severity ? ` · ${r.severity}` : ''}${r.description ? ` — ${r.description}` : ''}`} />
          ))}
          {health.data.emergency_contact.name ? <Row icon="alert-circle-outline" title={`Emergency: ${health.data.emergency_contact.name}`} subtitle={`${health.data.emergency_contact.relationship ?? ''} ${health.data.emergency_contact.phone ?? ''}`} onPress={health.data.emergency_contact.phone ? () => Linking.openURL(`tel:${health.data!.emergency_contact.phone}`) : undefined} last /> : null}
        </Card>
      ) : null}

      {documenting && session.data ? (
        <>
          <SectionHeader title="Treatment documentation" />
          <Card style={{ gap: 12 }}>
            <Text variant="subheading">Pain before treatment (0–10)</Text>
            <PainPicker value={pain.before} onChange={(n) => setPain((p) => ({ ...p, before: n }))} />
            <Text variant="subheading">Pain after treatment (0–10)</Text>
            <PainPicker value={pain.after} onChange={(n) => setPain((p) => ({ ...p, after: n }))} />
            <Button label="Save pain scores" variant="secondary" size="md" loading={saveSession.isPending} onPress={() => run(() => saveSession.mutateAsync({ sessionId: session.data!.id, pain_score_before: pain.before, pain_score_after: pain.after }), 'Saved')} />
          </Card>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Button label="Write clinical note" icon="create-outline" onPress={() => setNoteOpen(true)} />
            <Button label="Prescribe home exercises" icon="barbell-outline" variant="outline" onPress={() => router.push({ pathname: '/prescribe/[bookingId]', params: { bookingId: b.id } })} />
            <Button label="Goals & progress" icon="flag-outline" variant="outline" onPress={() => router.push({ pathname: '/client/[key]', params: { key: `${b.patient_user_id}|${b.family_member_id ?? 'self'}` } })} />
          </View>
        </>
      ) : null}

      <SectionHeader title="Status history" />
      <Card><StatusTimeline status={b.status} type={b.appointment_type} history={history.data ?? []} /></Card>

      {canCancel && b.status !== 'awaiting_confirmation' ? <Button label="Cancel appointment" variant="danger" style={{ marginTop: 20 }} onPress={() => setCancelOpen(true)} /> : null}

      <Sheet visible={cancelOpen} onClose={() => setCancelOpen(false)} title={b.status === 'awaiting_confirmation' ? 'Decline booking' : 'Cancel appointment'}
        footer={<Button label="Confirm" variant="danger" loading={update.isPending || respond.isPending} onPress={() => run(async () => {
          if (b.status === 'awaiting_confirmation') await respond.mutateAsync({ bookingId: b.id, accept: false, reason });
          else await update.mutateAsync({ bookingId: b.id, status: 'cancelled', note: reason });
          setCancelOpen(false);
        }, 'Done')} />}>
        <Text color="textMuted">The patient is notified immediately and any payment is reviewed for refund.</Text>
        <Input label="Reason" value={reason} onChangeText={setReason} multiline />
      </Sheet>

      <Sheet visible={noteOpen} onClose={() => setNoteOpen(false)} title="Clinical note"
        footer={<Button label="Save note" loading={saveNote.isPending} onPress={() => run(async () => {
          await saveNote.mutateAsync({ booking: b, sessionId: session.data?.id, subjective: note.s, objective: note.o, assessment: note.a, plan: note.p, patientSummary: note.summary, share: note.share });
          setNoteOpen(false); setNote({ s: '', o: '', a: '', p: '', summary: '', share: false });
        }, 'Note saved')} />}>
        <Input label="Subjective" multiline value={note.s} onChangeText={(t) => setNote({ ...note, s: t })} placeholder="What the patient reports" />
        <Input label="Objective" multiline value={note.o} onChangeText={(t) => setNote({ ...note, o: t })} placeholder="Findings, measurements" />
        <Input label="Assessment" multiline value={note.a} onChangeText={(t) => setNote({ ...note, a: t })} />
        <Input label="Plan" multiline value={note.p} onChangeText={(t) => setNote({ ...note, p: t })} />
        <Input label="Summary for the patient (plain language)" multiline value={note.summary} onChangeText={(t) => setNote({ ...note, summary: t })} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Switch value={note.share} onValueChange={(v) => setNote({ ...note, share: v })} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor={colors.surface} />
          <Text style={{ flex: 1 }}>Share this note with the patient</Text>
        </View>
      </Sheet>
    </Screen>
  );
}

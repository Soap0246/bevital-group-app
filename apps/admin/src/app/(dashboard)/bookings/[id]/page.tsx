import { notFound } from "next/navigation";
import { APPOINTMENT_TYPE_LABELS, PAYMENT_METHOD_LABELS, formatDateTime, formatMYR, nextStatusesFor, type AppointmentType, type BookingStatus, type PaymentMethod } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { adminAdvanceBooking, adminCancelBooking, assignTherapist } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { BookingStatusPill, Card, DataTable, LinkButton, PageHeader, Pill, Select, TextArea } from "@/components/ui/ui";

export const metadata = { title: "Booking" };

const ADVANCE_LABEL: Partial<Record<BookingStatus, string>> = {
  confirmed: "Mark confirmed", therapist_assigned: "Mark therapist assigned", on_the_way: "On the way", arrived: "Arrived / checked in", treatment_in_progress: "Start treatment", completed: "Complete",
};

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  // Free-text symptoms / patient notes are health information and are intentionally not selected.
  const { data: b } = await supabase
    .from("bookings")
    .select("id, reference, status, appointment_type, scheduled_start, scheduled_end, service_price, travel_distance_km, travel_fee, platform_fee, discount_amount, total_amount, auto_matched, visit_address_text, late_cancellation, cancellation_reason, therapist_id, package_purchase_id, clinic:clinics(name), service:services(name), patient:users!bookings_patient_user_id_fkey(id, full_name, phone), therapist:therapist_profiles!bookings_therapist_id_fkey(id, display_name)")
    .eq("id", id).maybeSingle();
  if (!b) notFound();

  const [history, payments, therapists] = await Promise.all([
    supabase.from("booking_status_history").select("*").eq("booking_id", id).order("created_at"),
    supabase.from("payments").select("*").eq("booking_id", id).order("created_at", { ascending: false }),
    supabase.from("therapist_profiles").select("id, display_name").eq("verification_status", "verified").order("display_name"),
  ]);
  const pick = (v: unknown, k: string) => (v as Record<string, string> | null)?.[k];
  const status = b.status as BookingStatus;
  const type = b.appointment_type as AppointmentType;
  const advance = nextStatusesFor(status, "admin", type).filter((s) => s !== "cancelled");
  const canCancel = nextStatusesFor(status, "admin", type).includes("cancelled");
  const canReassign = ["awaiting_confirmation", "confirmed", "therapist_assigned"].includes(status);

  return (
    <>
      <PageHeader title={b.reference} description={`${pick(b.service, "name") ?? ""} · ${APPOINTMENT_TYPE_LABELS[type]}`} actions={<><BookingStatusPill status={status} /><LinkButton href="/bookings" variant="outline">← All bookings</LinkButton></>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Appointment">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-muted">When</dt><dd className="font-semibold">{formatDateTime(b.scheduled_start)} → {formatDateTime(b.scheduled_end)}</dd></div>
            <div><dt className="text-muted">Patient</dt><dd className="font-semibold">{pick(b.patient, "full_name")} {pick(b.patient, "phone") ? `· ${pick(b.patient, "phone")}` : ""}</dd></div>
            <div><dt className="text-muted">Physiotherapist</dt><dd className="font-semibold">{pick(b.therapist, "display_name") ?? "Unassigned"} {b.auto_matched ? <Pill>Auto-matched</Pill> : null}</dd></div>
            <div><dt className="text-muted">{type === "home" ? "Visit address" : "Clinic"}</dt><dd className="font-semibold">{type === "home" ? (b.visit_address_text ?? "—") : (pick(b.clinic, "name") ?? "—")}</dd></div>
            {b.cancellation_reason ? <div><dt className="text-muted">Cancellation</dt><dd className="font-semibold">{b.cancellation_reason}{b.late_cancellation ? " (late cancellation)" : ""}</dd></div> : null}
          </dl>
        </Card>

        <Card title="Price">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Service</dt><dd>{formatMYR(b.service_price)}</dd></div>
            {type === "home" ? <div className="flex justify-between"><dt className="text-muted">Travel{b.travel_distance_km != null ? ` (≈${Number(b.travel_distance_km).toFixed(1)} km)` : ""}</dt><dd>{formatMYR(b.travel_fee)}</dd></div> : null}
            <div className="flex justify-between"><dt className="text-muted">Booking fee</dt><dd>{formatMYR(b.platform_fee)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Discount{b.package_purchase_id ? " (package)" : ""}</dt><dd>− {formatMYR(b.discount_amount)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink"><dt>Total</dt><dd>{formatMYR(b.total_amount)}</dd></div>
          </dl>
          <div className="mt-4 space-y-1 text-sm">
            {(payments.data ?? []).length === 0 ? <p className="text-muted">No payment recorded.</p> : (payments.data ?? []).map((p) => (
              <p key={p.id} className="flex flex-wrap items-center gap-2"><Pill tone={p.status === "succeeded" ? "success" : p.status === "failed" ? "danger" : "warning"}>{p.status}</Pill>{PAYMENT_METHOD_LABELS[p.method as PaymentMethod]} · {formatMYR(p.amount)}{p.receipt_number ? ` · ${p.receipt_number}` : ""}{p.refund_required ? <Pill tone="danger">Refund needed</Pill> : null}</p>
            ))}
          </div>
        </Card>

        <Card title="Actions" className="lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-3">
            {canReassign ? (
              <ActionForm action={assignTherapist} submitLabel="Reassign" variant="secondary">
                <input type="hidden" name="booking_id" value={b.id} />
                <Select label="Reassign to" name="therapist_id" options={[{ value: "", label: "Choose physiotherapist…" }, ...(therapists.data ?? []).filter((t) => t.id !== b.therapist_id).map((t) => ({ value: t.id, label: t.display_name }))]} hint="Availability is re-checked on the server." />
              </ActionForm>
            ) : null}
            {advance.length > 0 ? (
              <div className="space-y-2"><p className="text-sm font-semibold text-ink-soft">Move status forward</p>
                {advance.map((s) => <ActionForm key={s} action={adminAdvanceBooking} submitLabel={ADVANCE_LABEL[s] ?? s} variant="outline" className="block"><input type="hidden" name="booking_id" value={b.id} /><input type="hidden" name="status" value={s} /></ActionForm>)}
                {status === "pending" ? <p className="text-xs text-subtle">Pending bookings advance only after the payment provider confirms payment — they cannot be pushed through manually.</p> : null}
              </div>
            ) : null}
            {canCancel ? (
              <ActionForm action={adminCancelBooking} submitLabel="Cancel booking" variant="danger" confirm="Cancel this booking? The patient and physiotherapist are notified and any payment is queued for refund.">
                <input type="hidden" name="booking_id" value={b.id} />
                <TextArea label="Reason (shown to the patient)" name="reason" rows={2} required />
              </ActionForm>
            ) : null}
          </div>
          {!canReassign && advance.length === 0 && !canCancel ? <p className="text-sm text-muted">This booking is {BOOKING_STATUS_LABEL(status)} — no further actions.</p> : null}
        </Card>

        <Card title="Status history" className="lg:col-span-2">
          <DataTable rows={history.data ?? []} rowKey={(r) => String(r.id)} columns={[
            { header: "When", cell: (r) => formatDateTime(r.created_at) },
            { header: "From", cell: (r) => (r.from_status ? <BookingStatusPill status={r.from_status as BookingStatus} /> : "—") },
            { header: "To", cell: (r) => <BookingStatusPill status={r.to_status as BookingStatus} /> },
            { header: "By", cell: (r) => r.changed_by_role ?? "system" },
            { header: "Note", cell: (r) => r.note ?? "" },
          ]} />
        </Card>
      </div>
    </>
  );
}

function BOOKING_STATUS_LABEL(s: BookingStatus) {
  return s.replace(/_/g, " ");
}

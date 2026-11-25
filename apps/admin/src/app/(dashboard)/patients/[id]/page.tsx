import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatDateTime, formatMYR, type BookingStatus } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { setUserActive } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, BookingStatusPill, Card, DataTable, LinkButton, PageHeader, Pill } from "@/components/ui/ui";

export const metadata = { title: "Patient" };

export default async function PatientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: user } = await supabase.from("users").select("id, full_name, email, phone, is_active, created_at, role").eq("id", id).eq("role", "patient").maybeSingle();
  if (!user) notFound();

  // Explicit column list: free-text symptoms / notes are health information and are not shown to admins.
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, reference, scheduled_start, status, appointment_type, total_amount, service:services(name), therapist:therapist_profiles!bookings_therapist_id_fkey(display_name)")
    .eq("patient_user_id", id).order("scheduled_start", { ascending: false }).limit(50);
  const { count: family } = await supabase.from("family_members").select("id", { count: "exact", head: true }).eq("primary_user_id", id);

  type Row = NonNullable<typeof bookings>[number];
  const svc = (r: Row) => (r.service as unknown as { name: string } | null)?.name ?? "—";
  const th = (r: Row) => (r.therapist as unknown as { display_name: string } | null)?.display_name ?? "—";

  return (
    <>
      <PageHeader title={user.full_name || "Patient"} description={user.email ?? undefined} actions={<LinkButton href="/patients" variant="outline">← All patients</LinkButton>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Account">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-muted">Phone</dt><dd className="font-semibold">{user.phone ?? "—"}</dd></div>
            <div><dt className="text-muted">Joined</dt><dd className="font-semibold">{formatDate(user.created_at)}</dd></div>
            <div><dt className="text-muted">Family profiles</dt><dd className="font-semibold">{family ?? 0}</dd></div>
            <div><dt className="text-muted">Status</dt><dd><Pill tone={user.is_active ? "success" : "danger"}>{user.is_active ? "Active" : "Deactivated"}</Pill></dd></div>
          </dl>
          <div className="mt-5">
            <ActionForm action={setUserActive} submitLabel={user.is_active ? "Deactivate account" : "Reactivate account"} variant={user.is_active ? "danger" : "primary"} confirm={user.is_active ? "Deactivate this patient? They will be signed out of the app's data access." : undefined}>
              <input type="hidden" name="id" value={user.id} />
              {!user.is_active ? <input type="hidden" name="active" value="true" /> : null}
            </ActionForm>
          </div>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Alert tone="info" title="Privacy by design">Administrators can't open a patient's medical history, notes or documents. A physiotherapist can see them only for an appointment the patient has chosen to share, and each access is audit-logged.</Alert>
          <Card title="Bookings">
            <DataTable
              rows={bookings ?? []} rowKey={(r) => r.id} empty="No bookings yet."
              columns={[
                { header: "Ref", cell: (r) => <Link href={`/bookings/${r.id}`} className="font-semibold text-brand-dark hover:underline">{r.reference}</Link> },
                { header: "Service", cell: svc },
                { header: "When", cell: (r) => formatDateTime(r.scheduled_start) },
                { header: "Physio", cell: th },
                { header: "Status", cell: (r) => <BookingStatusPill status={r.status as BookingStatus} /> },
                { header: "Total", cell: (r) => formatMYR(r.total_amount), className: "text-right" },
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}

import { notFound } from "next/navigation";
import { VERIFICATION_LABELS, WEEKDAY_NAMES, formatClock, type VerificationStatus } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { setTherapistVerification, setUserActive, updateTherapistAdmin } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, Card, Checkbox, LinkButton, PageHeader, Pill, Select } from "@/components/ui/ui";
import { VERIFICATION_TONE as TONE } from "@/lib/tones";

export const metadata = { title: "Physiotherapist" };

export default async function TherapistDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data: t } = await supabase.from("therapist_profiles").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();

  const [clinics, services, hours, creds, user, base] = await Promise.all([
    supabase.from("clinics").select("id, name").order("name"),
    supabase.from("therapist_services").select("service:services(name)").eq("therapist_id", id),
    supabase.from("therapist_availability").select("*").eq("therapist_id", id).order("day_of_week").order("start_time"),
    supabase.from("therapist_credentials").select("id, status, credential_type").eq("therapist_id", id),
    supabase.from("users").select("id, is_active, email, phone").eq("id", t.user_id).maybeSingle(),
    supabase.from("therapist_private").select("base_latitude").eq("therapist_id", id).maybeSingle(),
  ]);
  const status = t.verification_status as VerificationStatus;
  const approved = (creds.data ?? []).filter((c) => c.status === "approved").length;
  const byDay = new Map<number, string[]>();
  for (const h of hours.data ?? []) byDay.set(h.day_of_week, [...(byDay.get(h.day_of_week) ?? []), `${formatClock(h.start_time)}–${formatClock(h.end_time)} (${h.location_type})`]);

  return (
    <>
      <PageHeader title={t.display_name || "Physiotherapist"} description={user.data?.email ?? undefined}
        actions={<><Pill tone={TONE[status]}>{VERIFICATION_LABELS[status]}</Pill><LinkButton href="/verification" variant="outline">Credentials →</LinkButton><LinkButton href="/therapists" variant="outline">← All</LinkButton></>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <dl className="space-y-3 text-sm">
            <div><dt className="text-muted">Headline</dt><dd className="font-semibold">{t.headline ?? "—"}</dd></div>
            <div><dt className="text-muted">Experience</dt><dd className="font-semibold">{t.years_experience != null ? `${t.years_experience} years` : "—"}</dd></div>
            <div><dt className="text-muted">Qualifications</dt><dd className="font-semibold">{t.qualifications.join("; ") || "—"}</dd></div>
            <div><dt className="text-muted">Languages</dt><dd className="font-semibold">{t.languages.join(", ") || "—"}</dd></div>
            <div><dt className="text-muted">Home visits</dt><dd className="font-semibold">{t.offers_home_visits ? `Up to ${t.service_radius_km} km · base ${base.data?.base_latitude != null ? "set" : "NOT set"}` : "Not offered"}</dd></div>
            <div><dt className="text-muted">Rating</dt><dd className="font-semibold">{t.rating_count ? `${Number(t.rating_avg).toFixed(2)} from ${t.rating_count} reviews` : "No reviews yet"}</dd></div>
            <div><dt className="text-muted">Services</dt><dd className="font-semibold">{(services.data ?? []).map((s) => (s.service as unknown as { name: string } | null)?.name).filter(Boolean).join("; ") || "None selected"}</dd></div>
          </dl>
        </Card>

        <Card title="Verification">
          {status !== "verified" && approved === 0 ? <div className="mb-4"><Alert tone="warning" title="No approved credentials yet">Review their documents before verifying.</Alert></div> : null}
          <p className="mb-3 text-sm text-muted">{approved} of {(creds.data ?? []).length} credentials approved.</p>
          <div className="flex flex-wrap gap-2">
            {(["verified", "rejected", "suspended", "under_review"] as const).filter((s) => s !== status).map((s) => (
              <ActionForm key={s} action={setTherapistVerification} submitLabel={{ verified: "Verify", rejected: "Reject", suspended: "Suspend", under_review: "Return to review" }[s]} variant={s === "verified" ? "primary" : s === "under_review" ? "outline" : "danger"} className="inline-block" confirm={s === "suspended" || s === "rejected" ? `Set status to ${s}? The physiotherapist will stop appearing to patients.` : undefined}>
                <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={s} />
              </ActionForm>
            ))}
          </div>
        </Card>

        <Card title="Assignment & availability">
          <ActionForm action={updateTherapistAdmin} submitLabel="Save">
            <input type="hidden" name="id" value={t.id} />
            <Select label="Primary clinic" name="clinic_id" defaultValue={t.clinic_id} hint="Required for clinic appointments." options={[{ value: "", label: "— none —" }, ...(clinics.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
            <Checkbox label="Accepting new bookings" name="is_accepting_bookings" defaultChecked={t.is_accepting_bookings} />
          </ActionForm>
        </Card>

        <Card title="Weekly working hours">
          <ul className="space-y-1.5 text-sm">
            {WEEKDAY_NAMES.map((d, i) => <li key={d} className="flex justify-between gap-4"><span className="text-muted">{d}</span><span className="text-right font-medium">{byDay.get(i + 1)?.join(", ") ?? "—"}</span></li>)}
          </ul>
        </Card>

        <Card title="Account" className="lg:col-span-2">
          <ActionForm action={setUserActive} submitLabel={user.data?.is_active ? "Deactivate account" : "Reactivate account"} variant={user.data?.is_active ? "danger" : "primary"} confirm={user.data?.is_active ? "Deactivate this physiotherapist's account?" : undefined}>
            <input type="hidden" name="id" value={t.user_id} />
            {!user.data?.is_active ? <input type="hidden" name="active" value="true" /> : null}
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

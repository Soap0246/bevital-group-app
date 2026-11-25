import Link from "next/link";
import { formatDateTime, formatMYR, type BookingStatus } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { saveSetting } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, BookingStatusPill, Card, DataTable, Field, PageHeader, Pill } from "@/components/ui/ui";

export const metadata = { title: "Home visits" };

const TRAVEL_SETTINGS: Array<{ key: string; label: string; hint: string; step?: string }> = [
  { key: "travel_fee_free_km", label: "Free distance (km)", hint: "No travel fee within this distance." },
  { key: "travel_fee_base", label: "Base travel fee (RM)", hint: "Applied once beyond the free distance.", step: "0.01" },
  { key: "travel_fee_per_km", label: "Per extra km (RM)", hint: "Added for each km beyond the free distance.", step: "0.01" },
  { key: "travel_fee_max", label: "Maximum travel fee (RM)", hint: "Upper cap.", step: "0.01" },
  { key: "travel_distance_factor", label: "Road-distance factor", hint: "Multiplies straight-line distance to estimate road distance until a routing provider is connected.", step: "0.05" },
  { key: "home_visit_buffer_minutes", label: "Travel buffer (min)", hint: "Time blocked after each home visit." },
];

export default async function HomeVisits() {
  const { supabase } = await requireAdmin();
  const [settings, visits, therapists] = await Promise.all([
    supabase.from("system_settings").select("key, value").in("key", TRAVEL_SETTINGS.map((s) => s.key)),
    supabase.from("bookings")
      .select("id, reference, scheduled_start, status, travel_distance_km, travel_fee, visit_address_text, service:services(name), therapist:therapist_profiles!bookings_therapist_id_fkey(display_name)")
      .eq("appointment_type", "home").not("status", "in", "(pending,cancelled)").order("scheduled_start", { ascending: false }).limit(30),
    supabase.from("therapist_profiles").select("id, display_name, service_radius_km, verification_status").eq("offers_home_visits", true).order("display_name"),
  ]);
  const baseSet = new Set<string>();
  const { data: bases } = await supabase.from("therapist_private").select("therapist_id, base_latitude");
  for (const b of bases ?? []) if (b.base_latitude != null) baseSet.add(b.therapist_id);
  const val = Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value as number]));
  const pick = (v: unknown, k: string) => (v as Record<string, string> | null)?.[k] ?? "—";

  return (
    <>
      <PageHeader title="Home visit management" description="Travel-fee rules, therapist coverage and live home-visit bookings." />
      <div className="mb-6"><Alert tone="info" title="Distances are estimates">Fees use straight-line distance × the road-distance factor. Connect a routing provider (Google Maps / Mapbox) to replace this with real road distances and ETAs.</Alert></div>

      <Card title="Travel fee rules" className="mb-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {TRAVEL_SETTINGS.map((s) => (
            <ActionForm key={s.key} action={saveSetting} submitLabel="Save" variant="secondary" className="space-y-2">
              <input type="hidden" name="key" value={s.key} />
              <Field label={s.label} name="value" type="number" step={s.step ?? "1"} min={0} defaultValue={val[s.key]} hint={s.hint} />
            </ActionForm>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Physiotherapists offering home visits">
          <DataTable rows={therapists.data ?? []} rowKey={(r) => r.id} empty="Nobody offers home visits yet."
            columns={[
              { header: "Name", cell: (r) => <Link href={`/therapists/${r.id}`} className="font-semibold text-brand-dark hover:underline">{r.display_name}</Link> },
              { header: "Radius", cell: (r) => `${r.service_radius_km} km` },
              { header: "Base set", cell: (r) => <Pill tone={baseSet.has(r.id) ? "success" : "danger"}>{baseSet.has(r.id) ? "Yes" : "No — not bookable"}</Pill> },
              { header: "Verified", cell: (r) => <Pill tone={r.verification_status === "verified" ? "success" : "warning"}>{r.verification_status.replace("_", " ")}</Pill> },
            ]} />
        </Card>
        <Card title="Recent home visits">
          <DataTable rows={visits.data ?? []} rowKey={(r) => r.id} empty="No confirmed home visits yet."
            columns={[
              { header: "Ref", cell: (r) => <Link href={`/bookings/${r.id}`} className="font-semibold text-brand-dark hover:underline">{r.reference}</Link> },
              { header: "When", cell: (r) => formatDateTime(r.scheduled_start) },
              { header: "Physio", cell: (r) => pick(r.therapist, "display_name") },
              { header: "Distance", cell: (r) => (r.travel_distance_km != null ? `${Number(r.travel_distance_km).toFixed(1)} km` : "—") },
              { header: "Travel fee", cell: (r) => formatMYR(r.travel_fee), className: "text-right" },
              { header: "Status", cell: (r) => <BookingStatusPill status={r.status as BookingStatus} /> },
            ]} />
        </Card>
      </div>
    </>
  );
}

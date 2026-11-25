import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Alert, Card, DataTable, LinkButton, PageHeader, Pill } from "@/components/ui/ui";
import { ClinicsMap } from "@/components/ui/ClinicsMap";

export const metadata = { title: "Clinics" };

export default async function Clinics() {
  const { supabase } = await requireAdmin();
  const [clinics, therapists] = await Promise.all([
    supabase.from("clinics").select("*").order("name"),
    supabase.from("therapist_profiles").select("clinic_id").eq("verification_status", "verified").not("clinic_id", "is", null),
  ]);
  const staff = new Map<string, number>();
  for (const t of therapists.data ?? []) staff.set(t.clinic_id!, (staff.get(t.clinic_id!) ?? 0) + 1);
  const pins = (clinics.data ?? [])
    .filter((c) => c.latitude != null && c.longitude != null)
    .map((c) => ({ id: c.id, name: c.name, address: `${c.address_line1}, ${c.postcode} ${c.city}`, phone: c.phone, lat: Number(c.latitude), lng: Number(c.longitude), active: c.is_active }));
  return (
    <>
      <PageHeader title="Clinics" description="BeVital clinic locations patients can choose for clinic physiotherapy." actions={<LinkButton href="/clinics/new">+ New clinic</LinkButton>} />
      {pins.length > 0 ? <Card title="Clinic map" className="mb-6"><ClinicsMap clinics={pins} /></Card> : null}
      {clinics.error ? <Alert tone="danger" title="Couldn't load clinics">{clinics.error.message}</Alert> : (
        <DataTable rows={clinics.data ?? []} rowKey={(r) => r.id} empty="No clinics yet. Add one so patients can book clinic appointments."
          columns={[
            { header: "Clinic", cell: (r) => <Link href={`/clinics/${r.id}`} className="font-semibold text-brand-dark hover:underline">{r.name}</Link> },
            { header: "Address", cell: (r) => `${r.address_line1}, ${r.postcode} ${r.city}` },
            { header: "Phone", cell: (r) => r.phone ?? "—" },
            { header: "Verified physios", cell: (r) => staff.get(r.id) ?? 0, className: "text-right" },
            { header: "Status", cell: (r) => <Pill tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Open for booking" : "Inactive"}</Pill> },
          ]} />
      )}
    </>
  );
}

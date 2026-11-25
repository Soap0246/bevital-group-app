import Link from "next/link";
import { VERIFICATION_LABELS, VERIFICATION_STATUSES, type VerificationStatus } from "@bevital/shared";
import { VERIFICATION_TONE as TONE } from "@/lib/tones";
import { requireAdmin } from "@/lib/auth";
import { Alert, DataTable, LinkButton, PageHeader, Pill } from "@/components/ui/ui";

export const metadata = { title: "Physiotherapists" };

export default async function Therapists({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { supabase } = await requireAdmin();
  let q = supabase
    .from("therapist_profiles")
    .select("id, user_id, display_name, verification_status, rating_avg, rating_count, is_accepting_bookings, offers_home_visits, offers_clinic_visits, years_experience, clinic:clinics(name)")
    .order("display_name");
  if (status && (VERIFICATION_STATUSES as readonly string[]).includes(status)) q = q.eq("verification_status", status);
  const { data, error } = await q;

  return (
    <>
      <PageHeader title="Physiotherapists" description="Only verified, accepting physiotherapists appear to patients." actions={<LinkButton href="/verification">Verification queue</LinkButton>} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by status">
        <LinkButton href="/therapists" variant={!status ? "primary" : "outline"} size="sm">All</LinkButton>
        {VERIFICATION_STATUSES.map((s) => <LinkButton key={s} href={`/therapists?status=${s}`} variant={status === s ? "primary" : "outline"} size="sm">{VERIFICATION_LABELS[s]}</LinkButton>)}
      </nav>
      {error ? <Alert tone="danger" title="Couldn't load physiotherapists">{error.message}</Alert> : (
        <DataTable
          rows={data ?? []} rowKey={(r) => r.id} empty="No physiotherapists match."
          columns={[
            { header: "Name", cell: (r) => <Link href={`/therapists/${r.id}`} className="font-semibold text-brand-dark hover:underline">{r.display_name || "—"}</Link> },
            { header: "Status", cell: (r) => <Pill tone={TONE[r.verification_status as VerificationStatus]}>{VERIFICATION_LABELS[r.verification_status as VerificationStatus]}</Pill> },
            { header: "Clinic", cell: (r) => (r.clinic as unknown as { name: string } | null)?.name ?? "—" },
            { header: "Offers", cell: (r) => [r.offers_clinic_visits ? "Clinic" : null, r.offers_home_visits ? "Home" : null].filter(Boolean).join(" · ") || "—" },
            { header: "Rating", cell: (r) => (r.rating_count ? `${Number(r.rating_avg).toFixed(1)} (${r.rating_count})` : "No reviews") },
            { header: "Bookable", cell: (r) => <Pill tone={r.is_accepting_bookings && r.verification_status === "verified" ? "success" : "neutral"}>{r.is_accepting_bookings && r.verification_status === "verified" ? "Yes" : "No"}</Pill> },
          ]}
        />
      )}
    </>
  );
}

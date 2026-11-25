import Link from "next/link";
import { formatDate } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { Alert, DataTable, LinkButton, PageHeader, Pagination, Pill } from "@/components/ui/ui";

export const metadata = { title: "Patients" };
const PAGE_SIZE = 25;

export default async function Patients({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { supabase } = await requireAdmin();

  let query = supabase.from("users").select("id, full_name, email, phone, is_active, created_at", { count: "exact" }).eq("role", "patient").order("created_at", { ascending: false });
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const ids = (data ?? []).map((u) => u.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: b } = await supabase.from("bookings").select("patient_user_id").in("patient_user_id", ids).neq("status", "cancelled");
    for (const r of b ?? []) counts.set(r.patient_user_id, (counts.get(r.patient_user_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader title="Patients" description="Account and booking information only. Health records are private to patients and their consented physiotherapists." />
      <form className="mb-4 flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search name or email" aria-label="Search patients" className="min-h-11 w-full max-w-md rounded-xl border border-line-strong bg-surface px-3" />
        <button className="min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white">Search</button>
        {q ? <LinkButton href="/patients" variant="outline">Clear</LinkButton> : null}
      </form>
      {error ? <Alert tone="danger" title="Couldn't load patients">{error.message}</Alert> : (
        <>
          <DataTable
            rows={data ?? []}
            rowKey={(r) => r.id}
            empty="No patients match."
            columns={[
              { header: "Name", cell: (r) => <Link href={`/patients/${r.id}`} className="font-semibold text-brand-dark hover:underline">{r.full_name || "—"}</Link> },
              { header: "Email", cell: (r) => r.email ?? "—" },
              { header: "Phone", cell: (r) => r.phone ?? "—" },
              { header: "Joined", cell: (r) => formatDate(r.created_at) },
              { header: "Bookings", cell: (r) => counts.get(r.id) ?? 0, className: "text-right" },
              { header: "Status", cell: (r) => <Pill tone={r.is_active ? "success" : "danger"}>{r.is_active ? "Active" : "Deactivated"}</Pill> },
            ]}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ q }} basePath="/patients" />
        </>
      )}
    </>
  );
}

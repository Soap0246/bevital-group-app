import Link from "next/link";
import { APPOINTMENT_TYPE_LABELS, BOOKING_STATUSES, BOOKING_STATUS_META, formatDateTime, formatMYR, type AppointmentType, type BookingStatus } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { Alert, BookingStatusPill, DataTable, LinkButton, PageHeader, Pagination } from "@/components/ui/ui";

export const metadata = { title: "Bookings" };
const PAGE_SIZE = 25;

export default async function Bookings({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; from?: string; to?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { supabase } = await requireAdmin();

  let query = supabase
    .from("bookings")
    .select("id, reference, scheduled_start, status, appointment_type, total_amount, service:services(name), therapist:therapist_profiles!bookings_therapist_id_fkey(display_name), patient:users!bookings_patient_user_id_fkey(full_name)", { count: "exact" })
    .order("scheduled_start", { ascending: false });
  if (sp.status && (BOOKING_STATUSES as readonly string[]).includes(sp.status)) query = query.eq("status", sp.status);
  if (sp.type === "clinic" || sp.type === "home") query = query.eq("appointment_type", sp.type);
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) query = query.gte("scheduled_start", `${sp.from}T00:00:00+08:00`);
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) query = query.lte("scheduled_start", `${sp.to}T23:59:59+08:00`);
  if (sp.q?.trim()) query = query.ilike("reference", `%${sp.q.trim().replace(/[%,()]/g, "")}%`);
  const { data, count, error } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  type Row = NonNullable<typeof data>[number];
  const name = (v: unknown, k: string) => (v as Record<string, string> | null)?.[k] ?? "—";

  return (
    <>
      <PageHeader title="Bookings" description="All appointments across clinics and home visits." />
      <form className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <label className="text-xs font-semibold text-muted">Reference<input name="q" defaultValue={sp.q} placeholder="BV-001000" className="mt-1 min-h-10 w-full rounded-lg border border-line-strong px-3 text-sm font-normal text-text" /></label>
        <label className="text-xs font-semibold text-muted">Status
          <select name="status" defaultValue={sp.status ?? ""} className="mt-1 min-h-10 w-full rounded-lg border border-line-strong px-2 text-sm font-normal text-text">
            <option value="">All</option>{BOOKING_STATUSES.map((s) => <option key={s} value={s}>{BOOKING_STATUS_META[s].label}</option>)}
          </select></label>
        <label className="text-xs font-semibold text-muted">Type
          <select name="type" defaultValue={sp.type ?? ""} className="mt-1 min-h-10 w-full rounded-lg border border-line-strong px-2 text-sm font-normal text-text">
            <option value="">All</option><option value="clinic">Clinic</option><option value="home">Home</option>
          </select></label>
        <label className="text-xs font-semibold text-muted">From<input type="date" name="from" defaultValue={sp.from} className="mt-1 min-h-10 w-full rounded-lg border border-line-strong px-2 text-sm font-normal text-text" /></label>
        <label className="text-xs font-semibold text-muted">To<input type="date" name="to" defaultValue={sp.to} className="mt-1 min-h-10 w-full rounded-lg border border-line-strong px-2 text-sm font-normal text-text" /></label>
        <div className="flex items-end gap-2"><button className="min-h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">Filter</button><LinkButton href="/bookings" variant="outline" size="sm">Reset</LinkButton></div>
      </form>
      {error ? <Alert tone="danger" title="Couldn't load bookings">{error.message}</Alert> : (
        <>
          <DataTable
            rows={data ?? []} rowKey={(r) => r.id} empty="No bookings match these filters."
            columns={[
              { header: "Ref", cell: (r: Row) => <Link href={`/bookings/${r.id}`} className="font-semibold text-brand-dark hover:underline">{r.reference}</Link> },
              { header: "When", cell: (r: Row) => formatDateTime(r.scheduled_start) },
              { header: "Service", cell: (r: Row) => name(r.service, "name") },
              { header: "Patient", cell: (r: Row) => name(r.patient, "full_name") },
              { header: "Physio", cell: (r: Row) => name(r.therapist, "display_name") },
              { header: "Type", cell: (r: Row) => APPOINTMENT_TYPE_LABELS[r.appointment_type as AppointmentType] },
              { header: "Status", cell: (r: Row) => <BookingStatusPill status={r.status as BookingStatus} /> },
              { header: "Total", cell: (r: Row) => formatMYR(r.total_amount), className: "text-right" },
            ]}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/bookings" params={{ status: sp.status, type: sp.type, from: sp.from, to: sp.to, q: sp.q }} />
        </>
      )}
    </>
  );
}

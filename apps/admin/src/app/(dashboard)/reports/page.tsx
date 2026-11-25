import { addDaysToDateString, formatDateShort, formatMYR, toKlDateString } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { Alert, Card, DataTable, LinkButton, PageHeader, StatCard } from "@/components/ui/ui";
import { BarChart } from "@/components/ui/Charts";

export const metadata = { title: "Reports" };

interface Day { day: string; bookings: number; completed: number; cancelled: number; revenue: number }

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const today = toKlDateString();
  const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
  const to = valid(sp.to) ?? today;
  const from = valid(sp.from) ?? addDaysToDateString(to, -29);
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_report_timeseries", { p_from: from, p_to: to });
  const days = (data ?? []) as Day[];
  const sum = (k: keyof Omit<Day, "day">) => days.reduce((s, d) => s + Number(d[k]), 0);

  return (
    <>
      <PageHeader title="Reports & analytics" description="Daily activity computed from bookings and verified payments (Malaysian time)."
        actions={<LinkButton href={`/reports/export?from=${from}&to=${to}`} variant="outline">Download CSV</LinkButton>} />
      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4" role="search">
        <label className="text-xs font-semibold text-muted">From<input type="date" name="from" defaultValue={from} className="mt-1 block min-h-10 rounded-lg border border-line-strong px-2 text-sm font-normal text-text" /></label>
        <label className="text-xs font-semibold text-muted">To<input type="date" name="to" defaultValue={to} className="mt-1 block min-h-10 rounded-lg border border-line-strong px-2 text-sm font-normal text-text" /></label>
        <button className="min-h-10 rounded-lg bg-brand px-4 text-sm font-semibold text-white">Apply</button>
      </form>
      {error ? <Alert tone="danger" title="Couldn't load the report">{error.message}</Alert> : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Appointments" value={sum("bookings")} />
            <StatCard label="Completed" value={sum("completed")} tone="success" />
            <StatCard label="Cancelled" value={sum("cancelled")} tone="danger" />
            <StatCard label="Revenue (verified)" value={formatMYR(sum("revenue"))} tone="success" />
          </div>
          <div className="mb-6 grid gap-6 xl:grid-cols-2">
            <Card title="Appointments per day"><BarChart label="Appointments per day" data={days.map((d) => ({ label: formatDateShort(`${String(d.day).slice(0, 10)}T12:00:00+08:00`), value: Number(d.bookings) }))} /></Card>
            <Card title="Revenue per day (RM)"><BarChart label="Revenue per day in ringgit" valuePrefix="" data={days.map((d) => ({ label: formatDateShort(`${String(d.day).slice(0, 10)}T12:00:00+08:00`), value: Number(d.revenue) }))} /></Card>
          </div>
          <Card title="Daily detail">
            <DataTable rows={[...days].reverse()} rowKey={(r) => String(r.day)} columns={[
              { header: "Date", cell: (r) => formatDateShort(`${String(r.day).slice(0, 10)}T12:00:00+08:00`) },
              { header: "Appointments", cell: (r) => r.bookings, className: "text-right" },
              { header: "Completed", cell: (r) => r.completed, className: "text-right" },
              { header: "Cancelled", cell: (r) => r.cancelled, className: "text-right" },
              { header: "Revenue", cell: (r) => formatMYR(r.revenue), className: "text-right" },
            ]} />
          </Card>
        </>
      )}
    </>
  );
}

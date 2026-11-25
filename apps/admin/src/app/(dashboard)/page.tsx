import Link from "next/link";
import { addDaysToDateString, formatDateShort, formatMYR, toKlDateString, type AdminDashboardStats } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { Alert, Card, DataTable, PageHeader, StatCard } from "@/components/ui/ui";
import { BarChart, ShareBar, UtilisationBar } from "@/components/ui/Charts";

export const metadata = { title: "Overview" };

export default async function Overview() {
  const { supabase } = await requireAdmin();
  const today = toKlDateString();
  const from = addDaysToDateString(today, -29);

  const [statsRes, seriesRes] = await Promise.all([
    supabase.rpc("admin_dashboard_stats"),
    supabase.rpc("admin_report_timeseries", { p_from: from, p_to: today }),
  ]);

  if (statsRes.error) {
    return (
      <>
        <PageHeader title="Overview" />
        <Alert tone="danger" title="Couldn't load statistics">{statsRes.error.message}</Alert>
      </>
    );
  }
  const s = statsRes.data as AdminDashboardStats;
  const series = (seriesRes.data ?? []) as Array<{ day: string; bookings: number; revenue: number; completed: number; cancelled: number }>;
  const avgUtil = s.therapist_utilisation.length
    ? Math.round(s.therapist_utilisation.reduce((a, t) => a + Number(t.utilisation_pct), 0) / s.therapist_utilisation.length)
    : 0;

  return (
    <>
      <PageHeader title="Overview" description="Live figures calculated from the BeVital database. Nothing here is estimated or sample data." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered patients" value={s.total_patients} hint={`${s.active_patients} active in the last 90 days`} />
        <StatCard label="Physiotherapists" value={s.total_therapists} hint={`${s.verified_therapists} verified`} tone="info" />
        <Link href="/verification" className="block rounded-2xl focus-visible:outline-offset-4">
          <StatCard label="Pending verification" value={s.pending_verification} hint="Awaiting credential review →" tone={s.pending_verification > 0 ? "warning" : "success"} />
        </Link>
        <StatCard label="Cancellation rate" value={`${s.cancellation_rate}%`} hint="Excludes abandoned checkouts" tone={Number(s.cancellation_rate) > 20 ? "danger" : "success"} />
        <StatCard label="Appointments today" value={s.appointments_today} />
        <StatCard label="Appointments this month" value={s.appointments_month} />
        <StatCard label="Revenue this month" value={formatMYR(s.revenue_month)} hint="Verified payments, net of refunds" tone="success" />
        <StatCard label="Revenue to date" value={formatMYR(s.revenue_total)} tone="success" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Appointments — last 30 days" className="xl:col-span-2">
          <BarChart label="Appointments per day, last 30 days" data={series.map((d) => ({ label: formatDateShort(`${String(d.day).slice(0, 10)}T12:00:00+08:00`), value: Number(d.bookings) }))} />
        </Card>
        <Card title="Clinic vs home bookings">
          <ShareBar parts={[
            { label: "Clinic", value: Number(s.clinic_bookings), color: "var(--bv-primary)" },
            { label: "Home", value: Number(s.home_bookings), color: "var(--bv-accent)" },
          ]} />
          <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">Popular services</h3>
          {s.popular_services.length === 0 ? <p className="text-sm text-muted">No bookings yet.</p> : (
            <ol className="space-y-2 text-sm">
              {s.popular_services.map((p, i) => (
                <li key={p.service_id} className="flex items-center justify-between gap-3">
                  <span className="truncate text-ink-soft">{i + 1}. {p.name}</span>
                  <span className="font-semibold text-ink">{p.bookings}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Card title="Physiotherapist utilisation (last 30 days)" className="mt-6" action={<span className="text-sm text-muted">Average {avgUtil}%</span>}>
        <p className="mb-3 text-xs text-subtle">Booked session time ÷ weekly working hours (pro-rated to 30 days). Therapists without working hours show 0%.</p>
        <DataTable
          rowKey={(r) => r.therapist_id}
          rows={s.therapist_utilisation}
          empty="No verified physiotherapists yet."
          columns={[
            { header: "Physiotherapist", cell: (r) => <Link href={`/therapists/${r.therapist_id}`} className="font-semibold text-brand-dark hover:underline">{r.name}</Link> },
            { header: "Booked", cell: (r) => `${Math.round(Number(r.booked_minutes) / 60 * 10) / 10} h` },
            { header: "Available", cell: (r) => `${Math.round(Number(r.available_minutes) / 60 * 10) / 10} h` },
            { header: "Utilisation", cell: (r) => <UtilisationBar pct={Number(r.utilisation_pct)} /> },
          ]}
        />
      </Card>
    </>
  );
}

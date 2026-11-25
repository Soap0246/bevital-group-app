import { requireAdmin } from "@/lib/auth";

/** CSV export of the daily report. Admin-only (requireAdmin redirects everyone else). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("from and to must be YYYY-MM-DD", { status: 400 });
  }
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_report_timeseries", { p_from: from, p_to: to });
  if (error) return new Response(error.message, { status: 400 });

  const rows = (data ?? []) as Array<{ day: string; bookings: number; completed: number; cancelled: number; revenue: number }>;
  const csv = ["date,appointments,completed,cancelled,revenue_myr", ...rows.map((r) => [String(r.day).slice(0, 10), r.bookings, r.completed, r.cancelled, Number(r.revenue).toFixed(2)].join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bevital-report-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

import Link from "next/link";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUSES, formatDateTime, formatMYR, type PaymentMethod, type StatusTone } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { markRefundHandled } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, Card, DataTable, LinkButton, PageHeader, Pagination, Pill, StatCard } from "@/components/ui/ui";

export const metadata = { title: "Payments" };
const PAGE_SIZE = 25;
const TONE: Record<string, StatusTone> = { succeeded: "success", pending: "warning", processing: "info", failed: "danger", cancelled: "neutral", refunded: "neutral", partially_refunded: "neutral" };

export default async function Payments({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { supabase } = await requireAdmin();

  let q = supabase
    .from("payments")
    .select("id, amount, method, status, provider, provider_reference, receipt_number, paid_at, created_at, refund_required, refunded_amount, booking_id, payer:users!payments_payer_user_id_fkey(full_name)", { count: "exact" })
    .order("created_at", { ascending: false });
  if (sp.status && (PAYMENT_STATUSES as readonly string[]).includes(sp.status)) q = q.eq("status", sp.status);
  const [list, refunds, totals] = await Promise.all([
    q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("payments").select("id, amount, receipt_number, booking_id, payer:users!payments_payer_user_id_fkey(full_name)").eq("refund_required", true).order("created_at"),
    supabase.from("payments").select("amount, refunded_amount").in("status", ["succeeded", "partially_refunded"]),
  ]);
  const collected = (totals.data ?? []).reduce((s, p) => s + Number(p.amount) - Number(p.refunded_amount), 0);
  const who = (v: unknown) => (v as { full_name: string } | null)?.full_name ?? "—";

  return (
    <>
      <PageHeader title="Payments" description="A payment is 'succeeded' only after the payment provider's signed webhook is verified. Nothing here can be marked paid by hand." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Net collected (verified)" value={formatMYR(collected)} tone="success" />
        <StatCard label="Refunds to review" value={(refunds.data ?? []).length} tone={(refunds.data ?? []).length ? "danger" : "success"} />
        <StatCard label="Transactions" value={list.count ?? 0} tone="info" />
      </div>

      {(refunds.data ?? []).length > 0 ? (
        <Card title="Refund queue" className="mb-6">
          <Alert tone="warning" title="Refund through the payment provider first">These payments were collected for bookings that were later cancelled. Issue the refund in your payment provider's dashboard, then mark it handled here.</Alert>
          <div className="mt-4 divide-y divide-line">
            {(refunds.data ?? []).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-semibold text-ink">{who(p.payer)} · {formatMYR(p.amount)}</p><p className="text-xs text-muted">{p.receipt_number ?? "No receipt"} {p.booking_id ? <Link className="font-semibold text-brand-dark underline" href={`/bookings/${p.booking_id}`}>View booking</Link> : null}</p></div>
                <ActionForm action={markRefundHandled} submitLabel="Mark refund handled" variant="outline" className="inline-block" confirm="Confirm the refund has been issued through the payment provider?"><input type="hidden" name="id" value={p.id} /></ActionForm>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Filter by status">
        <LinkButton href="/payments" variant={!sp.status ? "primary" : "outline"} size="sm">All</LinkButton>
        {PAYMENT_STATUSES.map((s) => <LinkButton key={s} href={`/payments?status=${s}`} variant={sp.status === s ? "primary" : "outline"} size="sm">{s.replace("_", " ")}</LinkButton>)}
      </nav>
      {list.error ? <Alert tone="danger" title="Couldn't load payments">{list.error.message}</Alert> : (
        <>
          <DataTable rows={list.data ?? []} rowKey={(r) => r.id} empty="No payments."
            columns={[
              { header: "Receipt", cell: (r) => r.receipt_number ?? "—" },
              { header: "Payer", cell: (r) => who(r.payer) },
              { header: "Method", cell: (r) => PAYMENT_METHOD_LABELS[r.method as PaymentMethod] },
              { header: "Provider", cell: (r) => <span className="text-xs">{r.provider}{r.provider_reference ? ` · ${r.provider_reference}` : ""}</span> },
              { header: "Date", cell: (r) => formatDateTime(r.paid_at ?? r.created_at) },
              { header: "Status", cell: (r) => <div className="flex flex-wrap gap-1"><Pill tone={TONE[r.status]}>{r.status.replace("_", " ")}</Pill>{r.refund_required ? <Pill tone="danger">refund</Pill> : null}</div> },
              { header: "Amount", cell: (r) => formatMYR(r.amount), className: "text-right" },
            ]} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.count ?? 0} params={{ status: sp.status }} basePath="/payments" />
        </>
      )}
    </>
  );
}

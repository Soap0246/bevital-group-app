import { formatDate, formatMYR, type PackageRow, type PromotionRow } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { savePackage, savePromotion } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, Card, Checkbox, Field, PageHeader, Pill, Select, TextArea } from "@/components/ui/ui";

export const metadata = { title: "Packages & promotions" };

function PackageFields({ p, services }: { p?: PackageRow; services: Array<{ id: string; name: string }> }) {
  return (
    <>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <Field label="Package name" name="name" required defaultValue={p?.name} />
      <TextArea label="Description" name="description" rows={2} defaultValue={p?.description} />
      <Select label="Redeemable for" name="service_id" defaultValue={p?.service_id} options={[{ value: "", label: "Any physiotherapy service" }, ...services.map((s) => ({ value: s.id, label: s.name }))]} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Sessions" name="session_count" type="number" min={2} max={60} required defaultValue={p?.session_count ?? 5} />
        <Field label="Price (RM)" name="price" type="number" step="0.01" min={0} required defaultValue={p?.price} />
        <Field label="Valid for (days)" name="validity_days" type="number" min={7} max={730} required defaultValue={p?.validity_days ?? 180} />
      </div>
      <Checkbox label="Available to buy" name="is_active" defaultChecked={p?.is_active ?? true} />
    </>
  );
}

function PromoFields({ p }: { p?: PromotionRow }) {
  return (
    <>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Code" name="code" required defaultValue={p?.code} hint="Letters, numbers, - and _" /><Field label="Title" name="title" required defaultValue={p?.title} /></div>
      <TextArea label="Description" name="description" rows={2} defaultValue={p?.description} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Type" name="discount_type" defaultValue={p?.discount_type ?? "percent"} options={[{ value: "percent", label: "Percent off" }, { value: "fixed", label: "Fixed RM off" }]} />
        <Field label="Value" name="discount_value" type="number" step="0.01" min={0} required defaultValue={p?.discount_value} />
        <Field label="Max discount (RM)" name="max_discount" type="number" step="0.01" min={0} defaultValue={p?.max_discount} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Min spend (RM)" name="min_spend" type="number" step="0.01" min={0} defaultValue={p?.min_spend ?? 0} />
        <Field label="Valid until" name="valid_until" type="date" defaultValue={p?.valid_until?.slice(0, 10)} />
        <Field label="Total uses" name="usage_limit" type="number" min={1} defaultValue={p?.usage_limit} hint="Blank = unlimited" />
        <Field label="Uses per patient" name="per_user_limit" type="number" min={1} defaultValue={p?.per_user_limit ?? 1} />
      </div>
      <div className="flex flex-wrap gap-6"><Checkbox label="Featured on app home" name="is_featured" defaultChecked={p?.is_featured} /><Checkbox label="Active" name="is_active" defaultChecked={p?.is_active ?? true} /></div>
    </>
  );
}

export default async function Promotions() {
  const { supabase } = await requireAdmin();
  const [packages, promos, services, usage] = await Promise.all([
    supabase.from("packages").select("*").order("sort_order").order("created_at"),
    supabase.from("promotions").select("*").order("created_at", { ascending: false }),
    supabase.from("services").select("id, name").eq("is_active", true).order("name"),
    supabase.from("promotion_redemptions").select("promotion_id").is("reversed_at", null),
  ]);
  const used = new Map<string, number>();
  for (const r of usage.data ?? []) used.set(r.promotion_id, (used.get(r.promotion_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Packages & promotions" description="Multi-session packages and discount codes. Codes are validated on the server when a patient books." />
      <div className="mb-6"><Alert tone="warning" title="Demo data">Seeded packages and promotions are development examples. Replace them with real offers before launch.</Alert></div>

      <h2 className="mb-3 text-lg font-bold text-ink">Packages</h2>
      <div className="mb-8 space-y-3">
        <details className="rounded-2xl border border-line bg-surface p-5"><summary className="cursor-pointer font-semibold text-brand-dark">+ New package</summary>
          <div className="mt-4 max-w-2xl"><ActionForm action={savePackage} submitLabel="Create package"><PackageFields services={services.data ?? []} /></ActionForm></div></details>
        {(packages.data ?? []).map((p) => (
          <details key={p.id} className="rounded-2xl border border-line bg-surface p-5">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3"><span className="font-semibold text-ink">{p.name}</span><span className="flex items-center gap-3 text-sm text-muted">{p.session_count} sessions · {formatMYR(p.price)} · {p.validity_days} days <Pill tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "On sale" : "Off"}</Pill></span></summary>
            <div className="mt-4 max-w-2xl"><ActionForm action={savePackage} submitLabel="Save package"><PackageFields p={p as PackageRow} services={services.data ?? []} /></ActionForm></div>
          </details>
        ))}
      </div>

      <h2 className="mb-3 text-lg font-bold text-ink">Promotions & vouchers</h2>
      <div className="space-y-3">
        <details className="rounded-2xl border border-line bg-surface p-5"><summary className="cursor-pointer font-semibold text-brand-dark">+ New promotion</summary>
          <div className="mt-4 max-w-3xl"><ActionForm action={savePromotion} submitLabel="Create promotion"><PromoFields /></ActionForm></div></details>
        {(promos.data ?? []).map((p) => (
          <details key={p.id} className="rounded-2xl border border-line bg-surface p-5">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
              <span className="font-semibold text-ink"><code className="rounded bg-brand-light px-2 py-0.5 text-brand-dark">{p.code}</code> {p.title}</span>
              <span className="flex items-center gap-3 text-sm text-muted">{p.discount_type === "percent" ? `${p.discount_value}% off` : `RM ${p.discount_value} off`} · used {used.get(p.id) ?? 0}{p.usage_limit ? `/${p.usage_limit}` : ""}{p.valid_until ? ` · until ${formatDate(p.valid_until)}` : ""} <Pill tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "Active" : "Off"}</Pill></span>
            </summary>
            <div className="mt-4 max-w-3xl"><ActionForm action={savePromotion} submitLabel="Save promotion"><PromoFields p={p as PromotionRow} /></ActionForm></div>
          </details>
        ))}
      </div>
    </>
  );
}

import Link from "next/link";
import { formatDuration, formatMYR } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { Alert, DataTable, LinkButton, PageHeader, Pill } from "@/components/ui/ui";

export const metadata = { title: "Services" };

export default async function Services() {
  const { supabase } = await requireAdmin();
  const [services, categories] = await Promise.all([
    supabase.from("services").select("*").order("sort_order"),
    supabase.from("service_categories").select("id, name, sort_order").order("sort_order"),
  ]);
  const cat = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const rows = [...(services.data ?? [])].sort((a, b) => (cat.get(a.category_id) ?? "").localeCompare(cat.get(b.category_id) ?? "") || a.sort_order - b.sort_order);

  return (
    <>
      <PageHeader title="Services" description="The marketplace catalogue. Every service shown in the apps is read from here — nothing is hardcoded." actions={<LinkButton href="/services/new">+ New service</LinkButton>} />
      {services.error ? <Alert tone="danger" title="Couldn't load services">{services.error.message}</Alert> : (
        <DataTable
          rows={rows} rowKey={(r) => r.id}
          columns={[
            { header: "Service", cell: (r) => <Link href={`/services/${r.id}`} className="font-semibold text-brand-dark hover:underline">{r.name}</Link> },
            { header: "Category", cell: (r) => cat.get(r.category_id) ?? "—" },
            { header: "Duration", cell: (r) => formatDuration(r.duration_minutes) },
            { header: "Clinic", cell: (r) => (r.supports_clinic ? formatMYR(r.price_clinic) : "—"), className: "text-right" },
            { header: "Home", cell: (r) => (r.supports_home ? formatMYR(r.price_home) : "—"), className: "text-right" },
            { header: "Status", cell: (r) => <Pill tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Hidden"}</Pill> },
          ]}
        />
      )}
    </>
  );
}

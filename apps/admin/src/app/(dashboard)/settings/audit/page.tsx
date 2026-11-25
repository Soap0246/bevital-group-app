import { formatDateTime } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { Alert, DataTable, LinkButton, PageHeader, Pagination, Pill } from "@/components/ui/ui";

export const metadata = { title: "Audit log" };
const PAGE_SIZE = 50;

export default async function AuditLog({ searchParams }: { searchParams: Promise<{ entity?: string; action?: string; page?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { supabase } = await requireAdmin();
  let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (sp.entity) q = q.eq("entity_type", sp.entity);
  if (sp.action) q = q.eq("action", sp.action);
  const { data, count, error } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of privileged changes and every physiotherapist access to a patient's health profile. Entries cannot be edited or deleted." actions={<LinkButton href="/settings" variant="outline">← Settings</LinkButton>} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Quick filters">
        <LinkButton href="/settings/audit" size="sm" variant={!sp.entity && !sp.action ? "primary" : "outline"}>All</LinkButton>
        <LinkButton href="/settings/audit?action=view_health_record" size="sm" variant={sp.action === "view_health_record" ? "primary" : "outline"}>Health-record access</LinkButton>
        {["users", "therapist_profiles", "therapist_credentials", "services", "payments", "system_settings", "promotions"].map((e) => (
          <LinkButton key={e} href={`/settings/audit?entity=${e}`} size="sm" variant={sp.entity === e ? "primary" : "outline"}>{e.replace("_", " ")}</LinkButton>
        ))}
      </nav>
      {error ? <Alert tone="danger" title="Couldn't load the audit log">{error.message}</Alert> : (
        <>
          <DataTable rows={data ?? []} rowKey={(r) => String(r.id)} empty="No entries."
            columns={[
              { header: "When", cell: (r) => formatDateTime(r.created_at) },
              { header: "Actor", cell: (r) => (r.actor_role ? <Pill tone={r.actor_role === "admin" ? "primary" : "info"}>{r.actor_role}</Pill> : <Pill>system</Pill>) },
              { header: "Action", cell: (r) => <code className="text-xs">{r.action}</code> },
              { header: "Entity", cell: (r) => <span className="text-xs">{r.entity_type}{r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ""}</span> },
              { header: "Details", cell: (r) => <code className="block max-w-md truncate text-xs text-muted" title={JSON.stringify(r.metadata)}>{JSON.stringify(r.metadata)}</code> },
            ]} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} params={{ entity: sp.entity, action: sp.action }} basePath="/settings/audit" />
        </>
      )}
    </>
  );
}

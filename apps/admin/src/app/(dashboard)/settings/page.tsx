import { requireAdmin } from "@/lib/auth";
import { saveSetting } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, Card, Field, LinkButton, PageHeader, Pill } from "@/components/ui/ui";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from("system_settings").select("*").order("key");
  const provider = (data ?? []).find((s) => s.key === "payment_provider")?.value as string | undefined;
  return (
    <>
      <PageHeader title="System settings" description="Platform rules read by the database functions that price and validate bookings. Changes apply immediately." actions={<LinkButton href="/settings/audit" variant="outline">Audit log →</LinkButton>} />
      <div className="mb-6 space-y-3">
        {provider === "unconfigured" ? <Alert tone="warning" title="Online payments are switched off">Patients can create bookings but cannot pay until a payment provider is configured. Set up the Edge Functions and secrets in docs/DEPLOYMENT.md, then set <code>payment_provider</code> to the provider id (e.g. <code>billplz</code>).</Alert> : null}
        <Alert tone="info" title="Numbers only where numbers are expected">Numeric settings reject non-numeric values. Text settings (like the payment provider id) are stored as text.</Alert>
      </div>
      {error ? <Alert tone="danger" title="Couldn't load settings">{error.message}</Alert> : (
        <Card>
          <div className="divide-y divide-line">
            {(data ?? []).map((s) => (
              <ActionForm key={s.key} action={saveSetting} submitLabel="Save" variant="secondary" className="grid items-end gap-3 py-4 md:grid-cols-[1fr_16rem_auto]">
                <input type="hidden" name="key" value={s.key} />
                <div><p className="font-semibold text-ink"><code>{s.key}</code> {s.is_public ? <Pill tone="info">public to apps</Pill> : <Pill>private</Pill>}</p><p className="text-xs text-muted">{s.description}</p></div>
                <Field label="Value" name="value" type={typeof s.value === "number" ? "number" : "text"} step="any" defaultValue={String(s.value)} />
              </ActionForm>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

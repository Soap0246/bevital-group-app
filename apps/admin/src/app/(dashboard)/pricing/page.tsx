import { requireAdmin } from "@/lib/auth";
import { saveServicePrice, saveSetting } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, Card, Field, PageHeader } from "@/components/ui/ui";

export const metadata = { title: "Pricing" };

export default async function Pricing() {
  const { supabase } = await requireAdmin();
  const [services, settings] = await Promise.all([
    supabase.from("services").select("id, name, supports_clinic, supports_home, price_clinic, price_home, is_active").order("sort_order"),
    supabase.from("system_settings").select("key, value").in("key", ["platform_fee", "platform_commission_rate"]),
  ]);
  const set = Object.fromEntries((settings.data ?? []).map((s) => [s.key, s.value as number]));

  return (
    <>
      <PageHeader title="Pricing" description="Service prices (MYR) and platform charges. Changes apply to new bookings immediately; existing bookings keep the price they were made at." />
      <div className="mb-6"><Alert tone="warning" title="Placeholder prices">Seeded prices are development placeholders. Review every price before launch.</Alert></div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <Card title="Booking fee (per paid appointment)">
          <ActionForm action={saveSetting} submitLabel="Save fee" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="key" value="platform_fee" />
            <Field label="Amount (RM)" name="value" type="number" step="0.01" min={0} defaultValue={set.platform_fee} />
          </ActionForm>
          <p className="mt-2 text-xs text-subtle">Waived when a package session is used.</p>
        </Card>
        <Card title="Platform commission">
          <ActionForm action={saveSetting} submitLabel="Save commission" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="key" value="platform_commission_rate" />
            <Field label="Rate (0–1)" name="value" type="number" step="0.01" min={0} max={1} defaultValue={set.platform_commission_rate} />
          </ActionForm>
          <p className="mt-2 text-xs text-subtle">Share of (service + travel) kept by BeVital. The rest is physiotherapist earnings.</p>
        </Card>
      </div>

      <Card title="Service prices">
        <div className="divide-y divide-line">
          {(services.data ?? []).map((s) => (
            <ActionForm key={s.id} action={saveServicePrice} submitLabel="Update" variant="secondary" className="grid items-end gap-3 py-3 sm:grid-cols-[1fr_9rem_9rem_auto]">
              <input type="hidden" name="id" value={s.id} />
              <div><p className="font-semibold text-ink">{s.name}</p>{!s.is_active ? <p className="text-xs text-subtle">Hidden from patients</p> : null}</div>
              {s.supports_clinic ? <Field label="Clinic (RM)" name="price_clinic" type="number" step="0.01" min={0} defaultValue={s.price_clinic} /> : <div className="text-xs text-subtle">No clinic option</div>}
              {s.supports_home ? <Field label="Home (RM)" name="price_home" type="number" step="0.01" min={0} defaultValue={s.price_home} /> : <div className="text-xs text-subtle">No home option</div>}
            </ActionForm>
          ))}
        </div>
      </Card>
    </>
  );
}

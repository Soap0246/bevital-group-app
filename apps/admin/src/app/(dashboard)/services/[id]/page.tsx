import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { saveService } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Card, Checkbox, Field, LinkButton, PageHeader, Select, TextArea } from "@/components/ui/ui";

export const metadata = { title: "Service" };

export default async function ServiceForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const isNew = id === "new";
  const [{ data: service }, { data: categories }] = await Promise.all([
    isNew ? Promise.resolve({ data: null }) : supabase.from("services").select("*").eq("id", id).maybeSingle(),
    supabase.from("service_categories").select("id, name").order("sort_order"),
  ]);
  if (!isNew && !service) notFound();

  return (
    <>
      <PageHeader title={isNew ? "New service" : service!.name} actions={<LinkButton href="/services" variant="outline">← All services</LinkButton>} />
      <Card className="max-w-3xl">
        <ActionForm action={saveService} submitLabel={isNew ? "Create service" : "Save changes"}>
          {!isNew ? <input type="hidden" name="id" value={service!.id} /> : null}
          <Select label="Category" name="category_id" defaultValue={service?.category_id} options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          <Field label="Service name" name="name" required defaultValue={service?.name} />
          <Field label="URL slug" name="slug" defaultValue={service?.slug} hint="Leave blank to generate from the name. Changing it later changes the service link." />
          <TextArea label="Description" name="description" rows={4} required defaultValue={service?.description} />
          <TextArea label="Conditions treated" name="conditions" rows={4} defaultValue={service?.conditions_treated?.join("\n")} hint="One per line." />
          <TextArea label="Treatment objectives" name="objectives" rows={4} defaultValue={service?.treatment_objectives?.join("\n")} hint="One per line." />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Session duration (min)" name="duration_minutes" type="number" min={15} max={240} step="5" required defaultValue={service?.duration_minutes ?? 60} />
            <Field label="Clinic price (RM)" name="price_clinic" type="number" step="0.01" min={0} defaultValue={service?.price_clinic} />
            <Field label="Home price (RM)" name="price_home" type="number" step="0.01" min={0} defaultValue={service?.price_home} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Checkbox label="Available at clinic" name="supports_clinic" defaultChecked={service?.supports_clinic ?? true} />
            <Checkbox label="Available at home / on-site" name="supports_home" defaultChecked={service?.supports_home ?? true} />
            <Checkbox label="Visible to patients" name="is_active" defaultChecked={service?.is_active ?? true} />
          </div>
          <Field label="Sort order" name="sort_order" type="number" defaultValue={service?.sort_order ?? 0} />
        </ActionForm>
      </Card>
    </>
  );
}

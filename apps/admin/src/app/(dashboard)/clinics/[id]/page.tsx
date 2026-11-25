import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { saveClinic } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Card, Checkbox, Field, LinkButton, PageHeader } from "@/components/ui/ui";

export const metadata = { title: "Clinic" };

export default async function ClinicForm({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const isNew = id === "new";
  const { data: c } = isNew ? { data: null } : await supabase.from("clinics").select("*").eq("id", id).maybeSingle();
  if (!isNew && !c) notFound();
  return (
    <>
      <PageHeader title={isNew ? "New clinic" : c!.name} actions={<LinkButton href="/clinics" variant="outline">← All clinics</LinkButton>} />
      <Card className="max-w-2xl">
        <ActionForm action={saveClinic} submitLabel={isNew ? "Create clinic" : "Save changes"}>
          {!isNew ? <input type="hidden" name="id" value={c!.id} /> : null}
          <Field label="Clinic name" name="name" required defaultValue={c?.name} />
          <Field label="Address line 1" name="address_line1" required defaultValue={c?.address_line1} />
          <Field label="Address line 2" name="address_line2" defaultValue={c?.address_line2} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Postcode" name="postcode" required defaultValue={c?.postcode} />
            <Field label="City" name="city" required defaultValue={c?.city} />
            <Field label="State" name="state" required defaultValue={c?.state} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude" name="latitude" type="number" step="0.000001" defaultValue={c?.latitude} hint="Used for 'get directions'." />
            <Field label="Longitude" name="longitude" type="number" step="0.000001" defaultValue={c?.longitude} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Phone" name="phone" defaultValue={c?.phone} /><Field label="Email" name="email" type="email" defaultValue={c?.email} /></div>
          <Checkbox label="Open for bookings" name="is_active" defaultChecked={c?.is_active ?? true} />
        </ActionForm>
      </Card>
    </>
  );
}

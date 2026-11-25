"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyError } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import type { ActionState } from "@/components/ui/ActionForm";

// ───────────────────────── helpers ─────────────────────────
const fail = (e: unknown): ActionState => ({ error: friendlyError(e) });
const ok = (message = "Saved"): ActionState => ({ ok: true, message });
const lines = (v: FormDataEntryValue | null) => String(v ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const optNum = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().optional());
const optStr = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().optional());
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const firstIssue = (e: z.ZodError) => ({ error: e.issues[0]?.message ?? "Check the form" }) as ActionState;

// ───────────────────────── users ─────────────────────────
export async function setUserActive(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, user } = await requireAdmin();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Invalid user" };
  const active = bool(fd, "active");
  if (id.data === user.id && !active) return { error: "You cannot deactivate your own account." };
  const { error } = await supabase.from("users").update({ is_active: active }).eq("id", id.data);
  if (error) return fail(error);
  revalidatePath("/patients"); revalidatePath("/therapists");
  return ok(active ? "Account reactivated" : "Account deactivated");
}

// ───────────────────────── therapists & verification ─────────────────────────
export async function setTherapistVerification(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ id: z.uuid(), status: z.enum(["verified", "rejected", "suspended", "under_review", "pending"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  if (p.data.status === "verified") {
    const { count } = await supabase.from("therapist_credentials").select("id", { count: "exact", head: true }).eq("therapist_id", p.data.id).eq("status", "approved");
    if (!count) return { error: "Approve at least one credential (e.g. practising certificate) before verifying this physiotherapist." };
  }
  const { error } = await supabase.from("therapist_profiles").update({ verification_status: p.data.status }).eq("id", p.data.id);
  if (error) return fail(error);
  revalidatePath("/verification"); revalidatePath("/therapists"); revalidatePath(`/therapists/${p.data.id}`);
  return ok(`Status set to ${p.data.status.replace("_", " ")}`);
}

export async function reviewCredential(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ id: z.uuid(), status: z.enum(["approved", "rejected"]), notes: optStr }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  if (p.data.status === "rejected" && !p.data.notes) return { error: "Add a note so the physiotherapist knows what to fix." };
  const { error } = await supabase.from("therapist_credentials").update({ status: p.data.status, review_notes: p.data.notes ?? null }).eq("id", p.data.id);
  if (error) return fail(error);
  revalidatePath("/verification");
  return ok(p.data.status === "approved" ? "Credential approved" : "Credential rejected");
}

export async function updateTherapistAdmin(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ id: z.uuid(), clinic_id: optStr }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const { error } = await supabase.from("therapist_profiles").update({ clinic_id: p.data.clinic_id ?? null, is_accepting_bookings: bool(fd, "is_accepting_bookings") }).eq("id", p.data.id);
  if (error) return fail(error);
  revalidatePath(`/therapists/${p.data.id}`); revalidatePath("/therapists");
  return ok();
}

// ───────────────────────── services & pricing ─────────────────────────
const serviceSchema = z.object({
  id: optStr,
  category_id: z.uuid("Choose a category"),
  name: z.string().trim().min(3, "Name is required"),
  slug: optStr,
  description: z.string().trim().min(20, "Describe the service (at least 20 characters)"),
  duration_minutes: z.coerce.number().int().min(15).max(240),
  price_clinic: optNum,
  price_home: optNum,
  sort_order: z.coerce.number().int().default(0),
});

export async function saveService(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = serviceSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const supports_clinic = bool(fd, "supports_clinic");
  const supports_home = bool(fd, "supports_home");
  if (!supports_clinic && !supports_home) return { error: "Offer the service at the clinic, at home, or both." };
  if (supports_clinic && p.data.price_clinic == null) return { error: "Set a clinic price." };
  if (supports_home && p.data.price_home == null) return { error: "Set a home-visit price." };
  const row = {
    category_id: p.data.category_id, name: p.data.name, slug: p.data.slug || slugify(p.data.name), description: p.data.description,
    conditions_treated: lines(fd.get("conditions")), treatment_objectives: lines(fd.get("objectives")),
    duration_minutes: p.data.duration_minutes, supports_clinic, supports_home,
    price_clinic: supports_clinic ? p.data.price_clinic : null, price_home: supports_home ? p.data.price_home : null,
    is_active: bool(fd, "is_active"), sort_order: p.data.sort_order,
  };
  const res = p.data.id ? await supabase.from("services").update(row).eq("id", p.data.id) : await supabase.from("services").insert(row);
  if (res.error) return fail(res.error);
  revalidatePath("/services"); revalidatePath("/pricing");
  redirect("/services");
}

export async function saveServicePrice(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ id: z.uuid(), price_clinic: optNum, price_home: optNum }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const patch: Record<string, number> = {};
  if (p.data.price_clinic != null) patch.price_clinic = p.data.price_clinic;
  if (p.data.price_home != null) patch.price_home = p.data.price_home;
  if (Object.values(patch).some((v) => v < 0)) return { error: "Prices cannot be negative." };
  const { error } = await supabase.from("services").update(patch).eq("id", p.data.id);
  if (error) return fail(error);
  revalidatePath("/pricing"); revalidatePath("/services");
  return ok("Price updated");
}

// ───────────────────────── clinics ─────────────────────────
const clinicSchema = z.object({
  id: optStr, name: z.string().trim().min(3), address_line1: z.string().trim().min(3, "Address is required"), address_line2: optStr,
  city: z.string().trim().min(2), state: z.string().trim().min(2), postcode: z.string().regex(/^\d{5}$/, "Postcode must be 5 digits"),
  latitude: optNum, longitude: optNum, phone: optStr, email: optStr,
});

export async function saveClinic(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = clinicSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const { id, ...rest } = p.data;
  const row = { ...rest, address_line2: rest.address_line2 ?? null, latitude: rest.latitude ?? null, longitude: rest.longitude ?? null, phone: rest.phone ?? null, email: rest.email ?? null, is_active: bool(fd, "is_active") };
  const res = id ? await supabase.from("clinics").update(row).eq("id", id) : await supabase.from("clinics").insert(row);
  if (res.error) return fail(res.error);
  revalidatePath("/clinics");
  redirect("/clinics");
}

// ───────────────────────── packages & promotions ─────────────────────────
export async function savePackage(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ id: optStr, name: z.string().trim().min(3), description: optStr, service_id: optStr, session_count: z.coerce.number().int().min(2).max(60), price: z.coerce.number().min(0), validity_days: z.coerce.number().int().min(7).max(730) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const { id, ...rest } = p.data;
  const row = { ...rest, description: rest.description ?? null, service_id: rest.service_id ?? null, is_active: bool(fd, "is_active") };
  const res = id ? await supabase.from("packages").update(row).eq("id", id) : await supabase.from("packages").insert(row);
  if (res.error) return fail(res.error);
  revalidatePath("/promotions");
  return ok("Package saved");
}

export async function savePromotion(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({
    id: optStr, code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, "Code: 3–24 letters, numbers, - or _"), title: z.string().trim().min(3),
    description: optStr, discount_type: z.enum(["percent", "fixed"]), discount_value: z.coerce.number().positive(), max_discount: optNum, min_spend: z.coerce.number().min(0).default(0),
    valid_until: optStr, usage_limit: optNum, per_user_limit: z.coerce.number().int().min(1).default(1),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  if (p.data.discount_type === "percent" && p.data.discount_value > 100) return { error: "A percentage discount cannot exceed 100%." };
  const { id, valid_until, ...rest } = p.data;
  const row = {
    ...rest, description: rest.description ?? null, max_discount: rest.max_discount ?? null, usage_limit: rest.usage_limit ?? null,
    valid_until: valid_until ? new Date(`${valid_until}T23:59:59+08:00`).toISOString() : null,
    is_featured: bool(fd, "is_featured"), is_active: bool(fd, "is_active"),
  };
  const res = id ? await supabase.from("promotions").update(row).eq("id", id) : await supabase.from("promotions").insert(row);
  if (res.error) return fail(res.error);
  revalidatePath("/promotions");
  return ok("Promotion saved");
}

// ───────────────────────── reviews ─────────────────────────
export async function setReviewPublished(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Invalid review" };
  const { error } = await supabase.from("reviews").update({ is_published: bool(fd, "published") }).eq("id", id.data);
  if (error) return fail(error);
  revalidatePath("/reviews");
  return ok(bool(fd, "published") ? "Review published" : "Review hidden");
}

// ───────────────────────── bookings ─────────────────────────
export async function assignTherapist(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ booking_id: z.uuid(), therapist_id: z.uuid("Choose a physiotherapist") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const { error } = await supabase.rpc("admin_assign_therapist", { p_booking_id: p.data.booking_id, p_therapist_id: p.data.therapist_id });
  if (error) return fail(error);
  revalidatePath(`/bookings/${p.data.booking_id}`); revalidatePath("/bookings");
  return ok("Physiotherapist reassigned — they have been asked to accept");
}

export async function adminCancelBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ booking_id: z.uuid(), reason: z.string().trim().min(3, "Give a reason") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: p.data.booking_id, p_reason: p.data.reason });
  if (error) return fail(error);
  revalidatePath(`/bookings/${p.data.booking_id}`); revalidatePath("/bookings"); revalidatePath("/payments");
  return ok("Booking cancelled — any payment is queued for a refund decision");
}

export async function adminAdvanceBooking(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ booking_id: z.uuid(), status: z.enum(["confirmed", "therapist_assigned", "on_the_way", "arrived", "treatment_in_progress", "completed"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const { error } = await supabase.rpc("update_booking_status", { p_booking_id: p.data.booking_id, p_new_status: p.data.status, p_note: "Updated by admin" });
  if (error) return fail(error);
  revalidatePath(`/bookings/${p.data.booking_id}`); revalidatePath("/bookings");
  return ok("Status updated");
}

// ───────────────────────── payments ─────────────────────────
/**
 * Refund bookkeeping only. Moving money back must be done with the payment provider (dashboard or the
 * `refund-payment` Edge Function once configured); this just clears the flag after a refund has been made.
 */
export async function markRefundHandled(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const id = z.uuid().safeParse(fd.get("id"));
  if (!id.success) return { error: "Invalid payment" };
  const { error } = await supabase.from("payments").update({ refund_required: false }).eq("id", id.data);
  if (error) return fail(error);
  revalidatePath("/payments");
  return ok("Marked as handled");
}

// ───────────────────────── system settings ─────────────────────────
export async function saveSetting(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase } = await requireAdmin();
  const p = z.object({ key: z.string().min(1), value: z.string().trim().min(1, "Value is required") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return firstIssue(p.error);
  const { data: existing } = await supabase.from("system_settings").select("value").eq("key", p.data.key).maybeSingle();
  if (!existing) return { error: "Unknown setting" };
  let value: unknown = p.data.value;
  if (typeof existing.value === "number") {
    const n = Number(p.data.value);
    if (!Number.isFinite(n) || n < 0) return { error: "Enter a non-negative number." };
    value = n;
  }
  const { error } = await supabase.from("system_settings").update({ value }).eq("key", p.data.key);
  if (error) return fail(error);
  revalidatePath("/settings"); revalidatePath("/home-visits"); revalidatePath("/pricing");
  return ok("Setting saved");
}

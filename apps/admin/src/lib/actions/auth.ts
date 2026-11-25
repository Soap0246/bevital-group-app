"use server";

import { redirect } from "next/navigation";
import { friendlyError, loginSchema } from "@bevital/shared";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/components/ui/ActionForm";

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter a valid email address and your password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: friendlyError(error) };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("users").select("role, is_active").eq("id", user?.id ?? "").maybeSingle();
  if (!profile || profile.role !== "admin" || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account does not have access to the admin portal." };
  }
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

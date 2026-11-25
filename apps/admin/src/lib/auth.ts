import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Verifies the caller is an active admin and returns an RLS-bound client. Call it at the top of every
 * page, route handler and server action that reads or writes data (deduplicated per request).
 */
export const requireAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, role, full_name, email, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || !profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=not-admin");
  }
  return { supabase, user, profile };
});

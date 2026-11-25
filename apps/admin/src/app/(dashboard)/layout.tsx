import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/auth";
import { Sidebar } from "@/components/ui/Sidebar";
import { Logo } from "@/components/ui/Logo";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireAdmin();
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar
        logo={<Logo variant="nolb" height={36} />}
        user={{ name: profile.full_name || "Administrator", email: profile.email ?? "" }}
        signOut={
          <form action={signOutAction}>
            <button type="submit" className="min-h-10 w-full rounded-xl border border-line-strong text-sm font-semibold text-ink-soft hover:bg-surface-alt">Sign out</button>
          </form>
        }
      />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}

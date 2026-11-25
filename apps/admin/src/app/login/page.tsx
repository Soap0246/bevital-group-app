import type { Metadata } from "next";
import { BRAND } from "@bevital/shared";
import { signIn } from "@/lib/actions/auth";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, Field } from "@/components/ui/ui";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-brand-light to-surface-alt p-4">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-[0_20px_50px_rgba(11,42,60,0.12)]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo variant="main" height={56} />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{BRAND.tagline}</p>
        </div>
        <h1 className="text-2xl font-bold text-ink">Operations portal</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Sign in with your BeVital administrator account.</p>
        {error === "not-admin" ? <div className="mb-4"><Alert tone="danger" title="Access denied">That account is not an active administrator.</Alert></div> : null}
        <ActionForm action={signIn} submitLabel="Sign in" className="space-y-4">
          <Field label="Email" name="email" type="email" required placeholder="you@bevital.example" />
          <Field label="Password" name="password" type="password" required />
        </ActionForm>
        <p className="mt-6 text-center text-xs text-subtle">Authorised personnel only. Activity in this portal is logged.</p>
      </div>
    </main>
  );
}

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
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-ink via-[#1F4A25] to-brand-dark p-12 text-white lg:flex lg:flex-col lg:justify-between" aria-hidden="true">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[var(--bv-lime)] opacity-20" />
        <div className="pointer-events-none absolute -bottom-32 left-10 size-80 rounded-full bg-[var(--bv-lime)] opacity-10" />
        <div className="relative inline-flex w-fit rounded-2xl bg-white px-5 py-3 shadow-lg"><Logo variant="nolb" height={44} /></div>
        <div className="relative max-w-md">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--bv-lime)]">{BRAND.tagline}</p>
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">Care that reaches every patient.</h2>
          <p className="mt-4 text-base text-white/75">Manage physiotherapists, bookings, clinics and payments from one secure operations portal.</p>
        </div>
        <p className="relative text-xs text-white/50">© BeVital · Authorised personnel only</p>
      </section>
      <section className="grid place-items-center bg-surface-alt p-4 sm:p-8">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-[0_20px_50px_rgba(16,38,26,0.10)]">
          <div className="mb-6 flex justify-center"><Logo variant="main" height={120} /></div>
          <h1 className="text-2xl font-bold text-ink">Operations portal</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Sign in with your BeVital administrator account.</p>
          {error === "not-admin" ? <div className="mb-4"><Alert tone="danger" title="Access denied">That account is not an active administrator.</Alert></div> : null}
          <ActionForm action={signIn} submitLabel="Sign in" className="space-y-4">
            <Field label="Email" name="email" type="email" required placeholder="you@bevital.example" />
            <Field label="Password" name="password" type="password" required />
          </ActionForm>
          <p className="mt-6 text-center text-xs text-subtle">Activity in this portal is logged.</p>
        </div>
      </section>
    </main>
  );
}

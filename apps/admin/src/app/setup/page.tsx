import { Alert } from "@/components/ui/ui";
import { Logo } from "@/components/ui/Logo";

export default function SetupPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-xl content-center gap-6 p-6">
      <Logo variant="main" height={56} />
      <Alert tone="warning" title="Backend not configured">
        Set <code className="font-semibold">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="font-semibold">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in
        <code className="font-semibold"> apps/admin/.env.local</code>, then restart the dev server. See <code>docs/DEPLOYMENT.md</code>.
      </Alert>
    </main>
  );
}

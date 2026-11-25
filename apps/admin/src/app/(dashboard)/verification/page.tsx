import Link from "next/link";
import { CREDENTIAL_TYPE_LABELS, VERIFICATION_LABELS, formatDate, type CredentialType, type VerificationStatus } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { reviewCredential, setTherapistVerification } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, Card, PageHeader, Pill, TextArea } from "@/components/ui/ui";
import { VERIFICATION_TONE as TONE } from "@/lib/tones";

export const metadata = { title: "Verification" };

/**
 * Credential review queue. Documents live in a PRIVATE bucket; admins get short-lived (5 min) signed URLs.
 * A physiotherapist can only be verified once at least one credential is approved.
 */
export default async function Verification() {
  const { supabase } = await requireAdmin();
  const { data: therapists, error } = await supabase
    .from("therapist_profiles")
    .select("id, display_name, verification_status, created_at")
    .in("verification_status", ["under_review", "pending"])
    .order("created_at");
  const ids = (therapists ?? []).map((t) => t.id);
  const { data: creds } = ids.length
    ? await supabase.from("therapist_credentials").select("*").in("therapist_id", ids).order("created_at")
    : { data: [] };

  const urls = new Map<string, string>();
  await Promise.all((creds ?? []).filter((c) => c.document_path).map(async (c) => {
    const { data } = await supabase.storage.from("therapist-credentials").createSignedUrl(c.document_path!, 300);
    if (data?.signedUrl) urls.set(c.id, data.signedUrl);
  }));

  return (
    <>
      <PageHeader title="Therapist verification" description="Check each physiotherapist's registration and practising certificate against the relevant regulator's public register before approving." />
      <div className="mb-6"><Alert tone="warning" title="Compliance note">Verification criteria (e.g. Allied Health Professions Act 2016 registration and a current Annual Practising Certificate) must be confirmed by BeVital's compliance lead. This tool records the decision; it does not check any register automatically.</Alert></div>
      {error ? <Alert tone="danger" title="Couldn't load the queue">{error.message}</Alert> : (therapists ?? []).length === 0 ? (
        <Card><p className="text-sm text-muted">The queue is empty. New physiotherapists appear here after they submit credentials.</p></Card>
      ) : (
        <div className="space-y-6">
          {(therapists ?? []).map((t) => {
            const mine = (creds ?? []).filter((c) => c.therapist_id === t.id);
            const status = t.verification_status as VerificationStatus;
            return (
              <Card key={t.id} title={t.display_name || "Unnamed"} action={<Pill tone={TONE[status]}>{VERIFICATION_LABELS[status]}</Pill>}>
                <p className="mb-4 text-xs text-subtle">Signed up {formatDate(t.created_at)} · <Link href={`/therapists/${t.id}`} className="font-semibold text-brand-dark hover:underline">Full profile</Link></p>
                {mine.length === 0 ? <p className="text-sm text-muted">No credentials submitted yet.</p> : (
                  <div className="space-y-4">
                    {mine.map((c) => (
                      <div key={c.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{c.title}</p>
                            <p className="text-sm text-muted">{CREDENTIAL_TYPE_LABELS[c.credential_type as CredentialType]} · No. {c.credential_number ?? "—"}{c.issuer ? ` · ${c.issuer}` : ""}</p>
                            {c.expires_on ? <p className="text-xs text-subtle">Expires {formatDate(c.expires_on)}</p> : null}
                            {urls.get(c.id) ? <a href={urls.get(c.id)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-semibold text-brand-dark underline">Open document (link expires in 5 min)</a> : <p className="text-xs text-danger">No document attached</p>}
                          </div>
                          <Pill tone={c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : "info"}>{c.status}</Pill>
                        </div>
                        {c.status !== "approved" ? (
                          <ActionForm action={reviewCredential} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" hideSubmit>
                            <input type="hidden" name="id" value={c.id} />
                            <TextArea label="Reviewer note (required if rejecting)" name="notes" rows={2} defaultValue={c.review_notes} />
                            <button name="status" value="approved" className="min-h-11 rounded-xl bg-success px-4 text-sm font-semibold text-white">Approve</button>
                            <button name="status" value="rejected" className="min-h-11 rounded-xl bg-danger-light px-4 text-sm font-semibold text-danger">Reject</button>
                          </ActionForm>
                        ) : c.review_notes ? <p className="mt-2 text-xs text-muted">Note: {c.review_notes}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  <ActionForm action={setTherapistVerification} submitLabel="Verify physiotherapist" className="inline-block"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="verified" /></ActionForm>
                  <ActionForm action={setTherapistVerification} submitLabel="Reject application" variant="danger" className="inline-block" confirm="Reject this application?"><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="rejected" /></ActionForm>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

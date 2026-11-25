import { formatDate } from "@bevital/shared";
import { requireAdmin } from "@/lib/auth";
import { setReviewPublished } from "@/lib/actions/admin";
import { ActionForm } from "@/components/ui/ActionForm";
import { Alert, Card, PageHeader, Pill } from "@/components/ui/ui";

export const metadata = { title: "Reviews" };

export default async function Reviews() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, is_published, created_at, therapist:therapist_profiles(display_name)")
    .order("created_at", { ascending: false }).limit(100);
  const avg = data?.length ? data.reduce((s, r) => s + r.rating, 0) / data.length : null;

  return (
    <>
      <PageHeader title="Reviews & feedback" description={avg ? `${data!.length} recent reviews · average ${avg.toFixed(2)} / 5` : "Patient reviews appear here after completed appointments."} />
      {error ? <Alert tone="danger" title="Couldn't load reviews">{error.message}</Alert> : (data ?? []).length === 0 ? (
        <Card><p className="text-sm text-muted">No reviews yet. Reviews can only be written by patients for their own completed appointments.</p></Card>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{"★".repeat(r.rating)}<span className="text-line-strong">{"★".repeat(5 - r.rating)}</span> <span className="ml-2 text-sm font-normal text-muted">for {(r.therapist as unknown as { display_name: string } | null)?.display_name ?? "—"} · {formatDate(r.created_at)}</span></p>
                  <p className="mt-2 text-sm text-ink-soft">{r.comment ?? <em className="text-subtle">No comment</em>}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Pill tone={r.is_published ? "success" : "neutral"}>{r.is_published ? "Published" : "Hidden"}</Pill>
                  <ActionForm action={setReviewPublished} submitLabel={r.is_published ? "Hide" : "Publish"} variant="outline" className="inline-block"><input type="hidden" name="id" value={r.id} />{!r.is_published ? <input type="hidden" name="published" value="true" /> : null}</ActionForm>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { BOOKING_STATUS_META, type BookingStatus, type StatusTone } from "@bevital/shared";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 shadow-[0_6px_18px_rgba(11,42,60,0.05)] ${className}`}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint, tone = "brand" }: { label: string; value: ReactNode; hint?: string; tone?: "brand" | "success" | "warning" | "danger" | "info" }) {
  const accent = { brand: "bg-brand", success: "bg-success", warning: "bg-warning", danger: "bg-danger", info: "bg-info" }[tone];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-[0_6px_18px_rgba(11,42,60,0.05)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

const TONES: Record<StatusTone, string> = {
  warning: "bg-warning-light text-warning",
  info: "bg-info-light text-info",
  primary: "bg-brand-light text-brand-dark",
  success: "bg-success-light text-success",
  danger: "bg-danger-light text-danger",
  neutral: "bg-surface-alt text-muted",
};

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const m = BOOKING_STATUS_META[status];
  return <Pill tone={m.tone}>{m.label}</Pill>;
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T>({ columns, rows, empty = "Nothing to show yet.", rowKey }: { columns: Column<T>[]; rows: T[]; empty?: string; rowKey: (row: T) => string }) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-dashed border-line-strong bg-surface-alt p-10 text-center text-sm text-muted">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={`px-4 py-3 font-semibold ${c.className ?? ""}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-surface">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-surface-alt/60">
              {columns.map((c) => (
                <td key={c.header} className={`px-4 py-3 align-middle ${c.className ?? ""}`}>{c.cell(r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BTN = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-brand-light text-brand-dark hover:bg-brand-light/70",
  outline: "border border-line-strong bg-surface text-ink hover:bg-surface-alt",
  danger: "bg-danger-light text-danger hover:bg-danger-light/70",
  ghost: "text-brand hover:bg-brand-light",
} as const;

export function buttonClass(variant: keyof typeof BTN = "primary", size: "md" | "sm" = "md") {
  return `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size === "md" ? "min-h-11 px-4 text-sm" : "min-h-9 px-3 text-xs"} ${BTN[variant]}`;
}

export function LinkButton({ href, children, variant = "primary", size = "md" }: { href: string; children: ReactNode; variant?: keyof typeof BTN; size?: "md" | "sm" }) {
  return <Link href={href} className={buttonClass(variant, size)}>{children}</Link>;
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title: string; children?: ReactNode }) {
  const cls = { info: "bg-info-light text-info", warning: "bg-warning-light text-warning", danger: "bg-danger-light text-danger", success: "bg-success-light text-success" }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-xl p-4 text-sm ${cls}`}>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-1 text-ink-soft">{children}</div> : null}
    </div>
  );
}

export function Field({ label, name, defaultValue, type = "text", required, hint, placeholder, step, min, max }: {
  label: string; name: string; defaultValue?: string | number | null; type?: string; required?: boolean; hint?: string; placeholder?: string; step?: string; min?: number; max?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink-soft">{label}{required ? <span className="text-danger"> *</span> : null}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} required={required} placeholder={placeholder} step={step} min={min} max={max}
        className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-text placeholder:text-subtle focus:border-brand" />
      {hint ? <span className="mt-1 block text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export function TextArea({ label, name, defaultValue, rows = 3, hint, required }: { label: string; name: string; defaultValue?: string | null; rows?: number; hint?: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink-soft">{label}{required ? <span className="text-danger"> *</span> : null}</span>
      <textarea name={name} defaultValue={defaultValue ?? ""} rows={rows} required={required} className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-text focus:border-brand" />
      {hint ? <span className="mt-1 block text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export function Select({ label, name, defaultValue, options, hint }: { label: string; name: string; defaultValue?: string | null; options: Array<{ value: string; label: string }>; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink-soft">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-text focus:border-brand">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint ? <span className="mt-1 block text-xs text-subtle">{hint}</span> : null}
    </label>
  );
}

export function Checkbox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink-soft">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5 rounded border-line-strong accent-[var(--bv-primary)]" />
      {label}
    </label>
  );
}

/** Pagination links that preserve the other query params. */
export function Pagination({ page, pageSize, total, params, basePath }: { page: number; pageSize: number; total: number; params: Record<string, string | undefined>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm text-muted" aria-label="Pagination">
      <span>{total === 0 ? "No results" : `Page ${page} of ${pages} · ${total} total`}</span>
      <div className="flex gap-2">
        {page > 1 ? <LinkButton href={href(page - 1)} variant="outline" size="sm">← Previous</LinkButton> : null}
        {page < pages ? <LinkButton href={href(page + 1)} variant="outline" size="sm">Next →</LinkButton> : null}
      </div>
    </nav>
  );
}

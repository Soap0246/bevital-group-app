/** Dependency-free SVG charts (server-rendered, accessible). */

export function BarChart({ data, height = 180, label, valuePrefix = "" }: { data: Array<{ label: string; value: number }>; height?: number; label: string; valuePrefix?: string }) {
  const w = Math.max(320, data.length * 36);
  const padB = 28, padT = 22;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = Math.min(28, (w / Math.max(1, data.length)) * 0.62);
  const step = w / Math.max(1, data.length);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label} className="h-auto w-full">
        {data.map((d, i) => {
          const h = ((height - padB - padT) * d.value) / max;
          const x = i * step + (step - bw) / 2;
          return (
            <g key={`${d.label}-${i}`}>
              <rect x={x} y={height - padB - h} width={bw} height={Math.max(h, d.value ? 2 : 0)} rx={5} fill="var(--bv-primary)" opacity={0.9} />
              {d.value > 0 && data.length <= 16 ? <text x={x + bw / 2} y={height - padB - h - 5} textAnchor="middle" fontSize="10" fill="var(--bv-ink)" fontWeight="600">{valuePrefix}{Math.round(d.value)}</text> : null}
              {(data.length <= 16 || i % Math.ceil(data.length / 12) === 0) ? <text x={x + bw / 2} y={height - 10} textAnchor="middle" fontSize="10" fill="var(--bv-text-muted)">{d.label}</text> : null}
            </g>
          );
        })}
        <line x1="0" x2={w} y1={height - padB} y2={height - padB} stroke="var(--bv-border)" />
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

export function ShareBar({ parts }: { parts: Array<{ label: string; value: number; color: string }> }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-surface-alt" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
        {total > 0 ? parts.map((p) => <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />) : null}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-ink-soft">
            <span className="size-3 rounded-full" style={{ background: p.color }} aria-hidden />
            {p.label}: <strong className="text-ink">{p.value}</strong>{total ? <span className="text-subtle">({Math.round((p.value / total) * 100)}%)</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UtilisationBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-brand-light" role="img" aria-label={`${pct}% utilised`}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${clamped}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-semibold text-ink-soft">{pct}%</span>
    </div>
  );
}

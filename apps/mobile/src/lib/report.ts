import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatDate, formatDateTime } from '@bevital/shared';
import type { RecoveryData } from '@/api/recovery';
import { adherence } from '@/api/recovery';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Builds a printable recovery summary from the patient's real records. */
export function buildProgressReportHtml(patientName: string, data: RecoveryData): string {
  const week = adherence(data.programmes, data.completions, 7);
  const sessions = [...data.sessions].reverse();
  const rows = sessions
    .map((s) => `<tr><td>${esc(formatDate(s.started_at))}</td><td>${esc(s.booking?.service?.name ?? 'Session')}</td><td>${s.pain_score_before ?? '–'}</td><td>${s.pain_score_after ?? '–'}</td></tr>`)
    .join('');
  const goals = data.goals
    .map((g) => `<li><b>${esc(g.title)}</b> — ${g.progress_percent}% (${esc(g.status)})${g.target_date ? `, target ${esc(formatDate(g.target_date))}` : ''}</li>`)
    .join('');
  const notes = data.notes
    .map((n) => `<li><i>${esc(formatDateTime(n.created_at))}</i> — ${esc(n.patient_summary ?? n.assessment ?? n.plan ?? '')}</li>`)
    .join('');
  const programmes = data.programmes
    .map((p) => `<h3>${esc(p.title)} <small>(${esc(p.status)}, ${p.frequency_per_week}×/week)</small></h3><ul>${p.items.map((i) => `<li>${esc(i.name)}${i.sets && i.reps ? ` — ${i.sets} × ${i.reps}` : ''}</li>`).join('')}</ul>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1C3326;padding:28px;font-size:13px}
    h1{color:#365B0B;margin:0 0 4px} h2{border-bottom:2px solid #EEF6DC;padding-bottom:4px;margin-top:24px;color:#10261A}
    table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid #E3EBDD;padding:6px;text-align:left}
    small{color:#566A5B;font-weight:normal} .foot{margin-top:28px;color:#8A9C8F;font-size:11px}
  </style></head><body>
    <h1>BeVital Recovery Report</h1>
    <div>${esc(patientName)} · generated ${esc(formatDateTime(new Date()))}</div>
    <h2>Goals</h2><ul>${goals || '<li>No goals recorded yet.</li>'}</ul>
    <h2>Treatment sessions</h2>
    <table><tr><th>Date</th><th>Service</th><th>Pain before (0–10)</th><th>Pain after (0–10)</th></tr>${rows || '<tr><td colspan="4">No sessions yet.</td></tr>'}</table>
    <h2>Home exercise programmes</h2>${programmes || '<p>No programmes yet.</p>'}
    <p>Exercises completed in the last 7 days: <b>${week.done}</b> of ${week.expected} prescribed (${week.pct}%).</p>
    <h2>Physiotherapist notes shared with you</h2><ul>${notes || '<li>No shared notes yet.</li>'}</ul>
    <div class="foot">BeVital – No One Left Behind. This report summarises information recorded in your BeVital account. It is not a medical diagnosis.</div>
  </body></html>`;
}

export async function shareProgressReport(html: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Your BeVital recovery report' });
  }
}

/** Digital receipt for a verified payment (only generated for status = succeeded). */
export function buildReceiptHtml(p: { receipt_number: string | null; paid_at: string | null; amount: number; method: string; provider_reference: string | null }, payer: string, description: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1C3326;padding:32px;font-size:14px}
    h1{color:#365B0B;margin:0} .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #E3EBDD}
    .total{font-size:20px;font-weight:700;color:#365B0B} .foot{margin-top:28px;color:#8A9C8F;font-size:11px}
  </style></head><body>
    <h1>BeVital — Payment receipt</h1>
    <p>Receipt <b>${esc(p.receipt_number)}</b> · ${esc(p.paid_at ? formatDateTime(p.paid_at) : '')}</p>
    <div class="row"><span>Paid by</span><span>${esc(payer)}</span></div>
    <div class="row"><span>For</span><span>${esc(description)}</span></div>
    <div class="row"><span>Method</span><span>${esc(p.method)}</span></div>
    <div class="row"><span>Provider reference</span><span>${esc(p.provider_reference ?? '–')}</span></div>
    <div class="row total"><span>Total paid</span><span>RM ${Number(p.amount).toFixed(2)}</span></div>
    <div class="foot">BeVital – No One Left Behind. This receipt confirms a payment verified by our payment provider.</div>
  </body></html>`;
}

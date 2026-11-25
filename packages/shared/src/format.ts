import { BRAND } from './brand';

const TZ = BRAND.timezone;

/** RM 1,234.50 */
export function formatMYR(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const dateFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dateShortFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('en-MY', { timeZone: TZ, weekday: 'short' });

export const formatDate = (iso: string | Date) => dateFmt.format(new Date(iso));
export const formatDateShort = (iso: string | Date) => dateShortFmt.format(new Date(iso));
/** '9:30 AM' (Malaysian time). Normalises the narrow no-break space some ICU builds emit. */
export const formatTime = (iso: string | Date) =>
  timeFmt.format(new Date(iso)).replace(/[  ]/g, ' ').toUpperCase();
export const formatDateTime = (iso: string | Date) => `${formatDate(iso)}, ${formatTime(iso)}`;
export const formatWeekdayShort = (iso: string | Date) => weekdayFmt.format(new Date(iso));

/** 'YYYY-MM-DD' for the given instant in Malaysian time. */
export const toKlDateString = (d: Date | string = new Date()) => ymdFmt.format(new Date(d));

/** Add whole days to a 'YYYY-MM-DD' string (calendar arithmetic, timezone safe). */
export function addDaysToDateString(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** ISO weekday 1 (Mon) – 7 (Sun) for a 'YYYY-MM-DD' string. */
export function isoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** 'HH:MM:SS' / 'HH:MM' → '9:00 AM' */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return '';
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function initials(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function ageFromDob(dob: string | null | undefined, now = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

export function greetingFor(date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(date));
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Friendly message for the stable BV_* error codes raised by the database. */
export function friendlyError(err: unknown): string {
  const raw = typeof err === 'string' ? err : (err as { message?: string })?.message ?? '';
  const known: Record<string, string> = {
    BV_SLOT_UNAVAILABLE: 'That time is no longer available. Please choose another time.',
    BV_PATIENT_OVERLAP: 'You already have an appointment at this time.',
    BV_PRICE_CHANGED: 'The price has changed. Please review the updated total.',
    BV_TOO_SOON: 'That time is too soon. Please choose a later time.',
    BV_TOO_FAR: 'That date is too far ahead to book.',
    BV_CONSENT_REQUIRED: 'Consent is required before continuing.',
    BV_INVALID_PROMO: 'That promo code cannot be used.',
    BV_INVALID_PACKAGE: 'That package cannot be used for this appointment.',
    BV_NO_COVERAGE: 'No physiotherapist covers this location yet.',
    BV_FORBIDDEN: 'You do not have permission to do that.',
    BV_INVALID_TRANSITION: 'That change is not allowed for this appointment.',
    BV_UNAUTHENTICATED: 'Please sign in again.',
    BV_INVALID_PAYMENT: 'This payment cannot be started.',
    BV_INVALID_REVIEW: 'You can only review your own completed appointments.',
  };
  const code = /BV_[A-Z_]+/.exec(raw)?.[0];
  if (code && known[code]) return known[code];
  const detail = /BV_[A-Z_]+:\s*(.*)$/.exec(raw)?.[1];
  if (detail) return detail;
  if (/Invalid login credentials/i.test(raw)) return 'Incorrect email or password.';
  if (/Email not confirmed/i.test(raw)) return 'Please verify your email first — check your inbox.';
  if (/User already registered/i.test(raw)) return 'An account with this email already exists.';
  if (/network|fetch/i.test(raw)) return 'Network problem. Check your connection and try again.';
  return raw || 'Something went wrong. Please try again.';
}

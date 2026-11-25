import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  addDaysToDateString, BOOKING_STATUS_META, formatDateTime, formatMYR, formatTime, formatWeekdayShort, toKlDateString,
  type AppointmentType, type AvailableTime, type BookingStatus, type BookingStatusHistoryRow,
} from '@bevital/shared';
import { colors, fontFamily, radius } from '@/theme';
import { Icon, Text } from '@/components/ui';

// ───────────────────────── Date strip ─────────────────────────
/** `soldOut` days (checked against real availability) are greyed out and cannot be picked. */
export function DateStrip({ value, onChange, days = 14, soldOut }: { value: string; onChange: (ymd: string) => void; days?: number; soldOut?: Set<string> }) {
  const today = toKlDateString();
  const list = Array.from({ length: days }, (_, i) => addDaysToDateString(today, i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }} style={{ marginHorizontal: -20 }}>
      {list.map((ymd) => {
        const on = ymd === value;
        const out = !!soldOut?.has(ymd);
        const d = new Date(`${ymd}T12:00:00+08:00`);
        const day = Number(ymd.slice(8));
        const month = new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', month: 'short' }).format(d);
        const full = new Intl.DateTimeFormat('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'full' }).format(d);
        return (
          <Pressable
            key={ymd}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: out }}
            accessibilityLabel={out ? `${full}, fully booked` : full}
            disabled={out}
            onPress={() => onChange(ymd)}
            style={[styles.dateItem, on && styles.dateItemOn, out && styles.dateItemOut]}
          >
            <Text variant="label" color={on ? 'surface' : out ? 'textSubtle' : 'textMuted'}>{formatWeekdayShort(d).toUpperCase()}</Text>
            <Text variant="heading" color={on ? 'surface' : out ? 'textSubtle' : 'ink'}>{day}</Text>
            <Text variant="label" color={on ? 'surface' : 'textSubtle'}>{out ? 'Full' : month}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ───────────────────────── Time grid ─────────────────────────
const klHour = (iso: string) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', hour12: false }).format(new Date(iso)));
const PERIODS = [
  { key: 'morning', label: 'Morning', icon: 'sunny-outline' as const, test: (h: number) => h < 12 },
  { key: 'afternoon', label: 'Afternoon', icon: 'partly-sunny-outline' as const, test: (h: number) => h >= 12 && h < 17 },
  { key: 'evening', label: 'Evening', icon: 'moon-outline' as const, test: (h: number) => h >= 17 },
];
const VISIBLE_PER_PERIOD = 8;

/** Times grouped Morning / Afternoon / Evening in a 4-column grid, with "More" past two rows. */
export function TimeGrid({ slots, value, onChange }: { slots: AvailableTime[]; value: string | null; onChange: (startIso: string) => void }) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  return (
    <View style={{ gap: 18 }}>
      {PERIODS.map((p) => {
        const list = slots.filter((s) => p.test(klHour(s.start_at)));
        if (list.length === 0) return null;
        const open = expanded[p.key] || list.length <= VISIBLE_PER_PERIOD;
        const shown = open ? list : list.slice(0, VISIBLE_PER_PERIOD - 1);
        return (
          <View key={p.key} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={p.icon} size={16} color="textMuted" />
              <Text variant="label" color="textMuted">{p.label.toUpperCase()}</Text>
            </View>
            <View style={styles.grid}>
              {shown.map((s) => {
                const on = value != null && new Date(value).getTime() === new Date(s.start_at).getTime();
                return (
                  <Pressable
                    key={s.start_at}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${formatTime(s.start_at)}, ${s.therapist_count} physiotherapist${s.therapist_count > 1 ? 's' : ''} available`}
                    onPress={() => onChange(new Date(s.start_at).toISOString())}
                    style={[styles.slot, on && styles.slotOn]}
                  >
                    <Text variant="bodyStrong" color={on ? 'surface' : 'ink'} numberOfLines={1} style={{ fontSize: 13 }}>{formatTime(s.start_at)}</Text>
                  </Pressable>
                );
              })}
              {!open ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Show ${list.length - shown.length} more ${p.label.toLowerCase()} times`} onPress={() => setExpanded((e) => ({ ...e, [p.key]: true }))} style={[styles.slot, styles.slotMore]}>
                  <Text variant="bodyStrong" color="primary" style={{ fontSize: 13 }}>More</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ───────────────────────── Price breakdown ─────────────────────────
function Line({ label, value, strong, tone, hint }: { label: string; value: string; strong?: boolean; tone?: 'success'; hint?: string }) {
  return (
    <View style={styles.line}>
      <View style={{ flex: 1 }}>
        <Text variant={strong ? 'subheading' : 'body'} color={strong ? 'ink' : 'inkSoft'}>{label}</Text>
        {hint ? <Text variant="caption" color="textSubtle">{hint}</Text> : null}
      </View>
      <Text variant={strong ? 'heading' : 'bodyStrong'} color={tone === 'success' ? 'success' : strong ? 'primaryDark' : 'ink'}>{value}</Text>
    </View>
  );
}

export interface PriceLines {
  service_price: number;
  travel_distance_km?: number | null;
  travel_fee: number;
  platform_fee: number;
  discount_amount: number;
  total_amount: number;
}

export function PriceBreakdown({ quote, type, packageApplied = false }: { quote: PriceLines; type: AppointmentType; packageApplied?: boolean }) {
  return (
    <View style={{ gap: 10 }} accessibilityLabel={`Price breakdown. Total ${formatMYR(quote.total_amount)}`}>
      <Line label="Service fee" value={formatMYR(quote.service_price)} />
      {type === 'home' ? (
        <Line
          label="Travel fee"
          value={Number(quote.travel_fee) === 0 ? 'Free' : formatMYR(quote.travel_fee)}
          hint={quote.travel_distance_km != null ? `≈ ${Number(quote.travel_distance_km).toFixed(1)} km estimated road distance` : undefined}
          tone={Number(quote.travel_fee) === 0 ? 'success' : undefined}
        />
      ) : null}
      {Number(quote.platform_fee) > 0 ? <Line label="Booking fee" value={formatMYR(quote.platform_fee)} /> : null}
      {Number(quote.discount_amount) > 0 ? <Line label={packageApplied ? 'Package session' : 'Promo discount'} value={`− ${formatMYR(quote.discount_amount)}`} tone="success" /> : null}
      <View style={styles.sep} />
      <Line label="Total" value={formatMYR(quote.total_amount)} strong />
    </View>
  );
}

// ───────────────────────── Status timeline ─────────────────────────
const CLINIC_FLOW: BookingStatus[] = ['pending', 'awaiting_confirmation', 'confirmed', 'arrived', 'treatment_in_progress', 'completed'];
const HOME_FLOW: BookingStatus[] = ['pending', 'awaiting_confirmation', 'confirmed', 'on_the_way', 'arrived', 'treatment_in_progress', 'completed'];

export function StatusTimeline({ status, type, history }: { status: BookingStatus; type: AppointmentType; history: BookingStatusHistoryRow[] }) {
  if (status === 'cancelled') {
    const at = history.find((h) => h.to_status === 'cancelled');
    return (
      <View style={styles.tlRow}>
        <View style={[styles.dot, { backgroundColor: colors.danger }]}><Icon name="close" size={14} color="surface" /></View>
        <View><Text variant="bodyStrong" color="danger">Cancelled</Text>{at ? <Text variant="caption" color="textMuted">{formatDateTime(at.created_at)}</Text> : null}</View>
      </View>
    );
  }
  const flow = type === 'home' ? HOME_FLOW : CLINIC_FLOW;
  // "Therapist assigned" occupies the "confirmed" step.
  const normalised: BookingStatus = status === 'therapist_assigned' ? 'confirmed' : status;
  const currentIdx = flow.indexOf(normalised);
  return (
    <View>
      {flow.map((step, i) => {
        const done = i < currentIdx || status === 'completed';
        const current = i === currentIdx && status !== 'completed';
        const hist = history.find((h) => h.to_status === step || (step === 'confirmed' && h.to_status === 'therapist_assigned'));
        const label = step === 'confirmed' && status === 'therapist_assigned' ? 'Therapist Assigned' : BOOKING_STATUS_META[step].label;
        return (
          <View key={step} style={styles.tlRow}>
            <View style={{ alignItems: 'center' }}>
              <View style={[styles.dot, done && { backgroundColor: colors.success }, current && { backgroundColor: colors.primary }]}>
                {done ? <Icon name="checkmark" size={14} color="surface" /> : current ? <View style={styles.dotInner} /> : null}
              </View>
              {i < flow.length - 1 ? <View style={[styles.tlLine, done && { backgroundColor: colors.success }]} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 18 }}>
              <Text variant="bodyStrong" color={done || current ? 'ink' : 'textSubtle'}>{label}</Text>
              {hist ? <Text variant="caption" color="textMuted">{formatDateTime(hist.created_at)}</Text> : null}
              {current ? <Text variant="caption" color="primaryDark">{BOOKING_STATUS_META[status].patientHint}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dateItem: { width: 60, minHeight: 76, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dateItemOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateItemOut: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '23.2%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  slotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotMore: { borderColor: colors.primaryMuted, backgroundColor: colors.primaryLight },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  tlRow: { flexDirection: 'row', gap: 14 },
  tlLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2, minHeight: 18 },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface },
});

export { fontFamily };

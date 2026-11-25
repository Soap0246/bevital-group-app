import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PAYMENT_METHOD_LABELS, formatDateTime, formatMYR, friendlyError, type PaymentRow, type PaymentStatus, type StatusTone } from '@bevital/shared';
import { useMyBookings, usePayments } from '@/api/bookings';
import { Badge, Banner, Button, EmptyState, ErrorState, Icon, LoadingList, Row, Screen, Sheet, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { buildReceiptHtml, shareProgressReport } from '@/lib/report';
import { colors, radius } from '@/theme';

const TONE: Record<PaymentStatus, StatusTone> = { pending: 'warning', processing: 'info', succeeded: 'success', failed: 'danger', cancelled: 'neutral', refunded: 'neutral', partially_refunded: 'neutral' };
const LABEL: Record<PaymentStatus, string> = { pending: 'Not completed', processing: 'Processing', succeeded: 'Paid', failed: 'Failed', cancelled: 'Cancelled', refunded: 'Refunded', partially_refunded: 'Part refunded' };

/** Payment history. Stale abandoned attempts are tucked away; an attempt that still needs paying shows "Try again". */
export default function Payments() {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();
  const payments = usePayments();
  const bookings = useMyBookings();
  const [sel, setSel] = useState<PaymentRow | null>(null);
  const [showOld, setShowOld] = useState(false);

  const bookingById = useMemo(() => new Map((bookings.data ?? []).map((b) => [b.id, b])), [bookings.data]);
  const { main, retry, stale } = useMemo(() => {
    const main: PaymentRow[] = [];
    const retry: PaymentRow[] = [];
    const stale: PaymentRow[] = [];
    const seenBooking = new Set<string>();
    for (const p of payments.data ?? []) {
      const open = ['pending', 'processing', 'failed', 'cancelled'].includes(p.status);
      if (!open) { main.push(p); continue; }
      const b = p.booking_id ? bookingById.get(p.booking_id) : undefined;
      const stillPayable = !!b && b.status === 'pending' && !!b.hold_expires_at && new Date(b.hold_expires_at) > new Date();
      // Only the newest attempt of a still-payable booking is shown as actionable; everything else is history noise.
      if (stillPayable && p.booking_id && !seenBooking.has(p.booking_id)) { seenBooking.add(p.booking_id); retry.push(p); } else stale.push(p);
    }
    return { main, retry, stale };
  }, [payments.data, bookingById]);

  const share = async (p: PaymentRow) => {
    try { await shareProgressReport(buildReceiptHtml(p, profile?.full_name ?? '', p.package_purchase_id ? 'Physiotherapy package' : 'Physiotherapy appointment')); }
    catch (e) { toast.show(friendlyError(e), 'error'); }
  };

  const item = (p: PaymentRow, dim?: boolean) => (
    <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.package_purchase_id ? 'Package' : 'Visit'}, ${formatMYR(p.amount)}, ${LABEL[p.status]}`} onPress={() => setSel(p)}
      style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: dim ? 0.7 : 1 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading">{p.package_purchase_id ? 'Package purchase' : 'Physiotherapy visit'}</Text>
        <Text variant="caption" color="textMuted">{formatDateTime(p.paid_at ?? p.created_at)} · {PAYMENT_METHOD_LABELS[p.method]}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text variant="subheading" color="primaryDark">{formatMYR(p.amount)}</Text>
        <Badge label={LABEL[p.status]} tone={TONE[p.status]} />
      </View>
    </Pressable>
  );

  return (
    <Screen title="Payments and receipts" refreshing={payments.isRefetching} onRefresh={() => void payments.refetch()}>
      <View style={{ gap: 12, marginTop: 8 }}>
        {payments.isLoading ? <LoadingList /> : payments.isError ? <ErrorState error={payments.error} onRetry={() => payments.refetch()} /> : (payments.data ?? []).length === 0 ? (
          <EmptyState icon="receipt-outline" title="No payments yet" body="Your payment history and digital receipts will appear here after your first visit." actionLabel="Book a physiotherapist" onAction={() => router.push('/book')} />
        ) : (
          <>
            {retry.map((p) => (
              <View key={p.id} style={{ padding: 14, gap: 10, borderRadius: radius.lg, backgroundColor: colors.warningLight }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="alert-circle-outline" size={20} color="warning" />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">Payment not completed</Text>
                    <Text variant="caption" color="inkSoft">{formatMYR(p.amount)} is waiting. Your slot is still held for now.</Text>
                  </View>
                </View>
                <Button label="Try again" size="md" icon="card-outline" onPress={() => router.push({ pathname: '/book/payment', params: { bookingId: p.booking_id! } })} />
              </View>
            ))}
            {main.length === 0 && retry.length === 0 ? <Text color="textMuted">No completed payments yet.</Text> : main.map((p) => item(p))}
            {stale.length > 0 ? (
              <>
                <Pressable accessibilityRole="button" onPress={() => setShowOld((v) => !v)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name={showOld ? 'chevron-down' : 'chevron-forward'} size={16} color="primary" />
                  <Text variant="bodyStrong" color="primary">{showOld ? 'Hide' : 'Show'} {stale.length} abandoned attempt{stale.length === 1 ? '' : 's'}</Text>
                </Pressable>
                {showOld ? stale.map((p) => item(p, true)) : null}
              </>
            ) : null}
          </>
        )}
      </View>

      <Sheet visible={!!sel} onClose={() => setSel(null)} title={sel?.status === 'succeeded' ? 'Digital receipt' : 'Payment'}
        footer={sel?.status === 'succeeded' ? <Button label="Share / save receipt (PDF)" icon="share-outline" onPress={() => share(sel)} /> : undefined}>
        {sel ? (
          <>
            <Row title="Amount" subtitle={formatMYR(sel.amount)} />
            <Row title="Status" subtitle={LABEL[sel.status]} />
            <Row title="Method" subtitle={PAYMENT_METHOD_LABELS[sel.method]} />
            {sel.receipt_number ? <Row title="Receipt number" subtitle={sel.receipt_number} /> : null}
            {sel.paid_at ? <Row title="Paid" subtitle={formatDateTime(sel.paid_at)} /> : null}
            {sel.provider_reference ? <Row title="Provider reference" subtitle={sel.provider_reference} last /> : null}
            {sel.status !== 'succeeded' ? <Banner tone="info" icon="information-circle-outline" title="Only verified payments get a receipt" body="A payment is confirmed only after our payment provider reports it to us." /> : null}
            {sel.refund_required ? <Banner tone="warning" icon="refresh-circle-outline" title="Refund under review" body="Your visit was cancelled after payment. Our team will process any refund due." /> : null}
            {sel.failure_reason ? <Banner tone="danger" icon="alert-circle-outline" title="Payment failed" body={sel.failure_reason} /> : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { PAYMENT_METHOD_LABELS, formatDateTime, formatMYR, friendlyError, type PaymentRow, type PaymentStatus, type StatusTone } from '@bevital/shared';
import { usePayments } from '@/api/bookings';
import { Badge, Banner, Button, Card, EmptyState, ErrorState, LoadingList, Row, Screen, Sheet, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { buildReceiptHtml, shareProgressReport } from '@/lib/report';

const TONE: Record<PaymentStatus, StatusTone> = { pending: 'warning', processing: 'info', succeeded: 'success', failed: 'danger', cancelled: 'neutral', refunded: 'neutral', partially_refunded: 'neutral' };

export default function Payments() {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();
  const payments = usePayments();
  const [sel, setSel] = useState<PaymentRow | null>(null);

  const share = async (p: PaymentRow) => {
    try { await shareProgressReport(buildReceiptHtml(p, profile?.full_name ?? '', p.package_purchase_id ? 'Physiotherapy package' : 'Physiotherapy appointment')); }
    catch (e) { toast.show(friendlyError(e), 'error'); }
  };

  return (
    <Screen title="Payments & receipts" refreshing={payments.isRefetching} onRefresh={() => void payments.refetch()}>
      <View style={{ gap: 12, marginTop: 8 }}>
        {payments.isLoading ? <LoadingList /> : payments.isError ? <ErrorState error={payments.error} onRetry={() => payments.refetch()} /> : (payments.data ?? []).length === 0 ? (
          <EmptyState icon="receipt-outline" title="No payments yet" body="Your payment history and digital receipts will appear here." actionLabel="Book a physiotherapist" onAction={() => router.push('/book')} />
        ) : (payments.data ?? []).map((p) => (
          <Card key={p.id} onPress={() => setSel(p)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading">{p.package_purchase_id ? 'Package purchase' : 'Appointment'}</Text>
                <Text variant="caption" color="textMuted">{formatDateTime(p.paid_at ?? p.created_at)} · {PAYMENT_METHOD_LABELS[p.method]}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text variant="subheading" color="primaryDark">{formatMYR(p.amount)}</Text>
                <Badge label={p.status.replace('_', ' ')} tone={TONE[p.status]} />
              </View>
            </View>
          </Card>
        ))}
      </View>

      <Sheet visible={!!sel} onClose={() => setSel(null)} title={sel?.status === 'succeeded' ? 'Digital receipt' : 'Payment'}
        footer={sel?.status === 'succeeded' ? <Button label="Share / save receipt (PDF)" icon="share-outline" onPress={() => share(sel)} /> : undefined}>
        {sel ? (
          <>
            <Row title="Amount" subtitle={formatMYR(sel.amount)} />
            <Row title="Status" subtitle={sel.status.replace('_', ' ')} />
            <Row title="Method" subtitle={PAYMENT_METHOD_LABELS[sel.method]} />
            {sel.receipt_number ? <Row title="Receipt number" subtitle={sel.receipt_number} /> : null}
            {sel.paid_at ? <Row title="Paid" subtitle={formatDateTime(sel.paid_at)} /> : null}
            {sel.provider_reference ? <Row title="Provider reference" subtitle={sel.provider_reference} last /> : null}
            {sel.status !== 'succeeded' ? <Banner tone="info" icon="information-circle-outline" title="Only verified payments get a receipt" body="A payment is confirmed only after our payment provider reports it to us." /> : null}
            {sel.refund_required ? <Banner tone="warning" icon="refresh-circle-outline" title="Refund under review" body="Your booking was cancelled after payment. Our team will process any refund due." /> : null}
            {sel.failure_reason ? <Banner tone="danger" icon="alert-circle-outline" title="Payment failed" body={sel.failure_reason} /> : null}
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

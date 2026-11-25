import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { formatMYR, friendlyError, type PaymentMethod } from '@bevital/shared';
import { startCheckout, useBooking, usePaymentForBooking } from '@/api/bookings';
import { Banner, Button, Screen, Skeleton, Text, useToast } from '@/components/ui';
import { Chip, ChipRow } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { useCountdown } from '@/hooks/useCountdown';
import { colors, radius } from '@/theme';

const METHODS: Array<{ id: PaymentMethod; label: string; icon: 'business-outline' | 'qr-code-outline' | 'card-outline' }> = [
  { id: 'fpx', label: 'FPX', icon: 'business-outline' },
  { id: 'duitnow_qr', label: 'DuitNow QR', icon: 'qr-code-outline' },
  { id: 'credit_card', label: 'Card', icon: 'card-outline' },
];

/** Pay for a booking. The app only opens the provider's hosted checkout; it can never mark a payment as paid. */
export default function Payment() {
  const router = useRouter();
  const toast = useToast();
  const { draft } = useBookingDraft();
  const { bookingId: paramId, method: methodParam, auto } = useLocalSearchParams<{ bookingId?: string; method?: string; auto?: string }>();
  const bookingId = paramId ?? draft.bookingId ?? undefined;
  const booking = useBooking(bookingId);
  const attempts = usePaymentForBooking(bookingId);
  const [method, setMethod] = useState<PaymentMethod>((METHODS.find((m) => m.id === methodParam)?.id) ?? 'fpx');
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [tried, setTried] = useState(false);
  const autoStarted = useRef(false);
  const hold = useCountdown(booking.data?.status === 'pending' ? booking.data.hold_expires_at : null);

  // After the checkout window closes, poll until the verified webhook has moved the booking forward.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => { void booking.refetch(); void attempts.refetch(); }, 3000);
    const stop = setTimeout(() => setWaiting(false), 120_000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [waiting, booking, attempts]);

  useEffect(() => {
    const s = booking.data?.status;
    if (s && s !== 'pending') router.replace('/book/confirmation');
  }, [booking.data?.status, router]);

  const b = booking.data;
  const pay = async () => {
    if (!b) return;
    setBusy(true);
    setTried(true);
    try {
      const r = await startCheckout({ bookingId: b.id, method });
      if (!r.providerConfigured) { setNotConfigured(true); return; }
      if (!r.checkoutUrl) throw new Error('The payment provider did not return a checkout link.');
      setWaiting(true);
      await WebBrowser.openBrowserAsync(r.checkoutUrl);
      void booking.refetch();
      void attempts.refetch();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Coming from "Pay" on the review step: start checkout straight away, once.
  useEffect(() => {
    if (auto === '1' && b && b.status === 'pending' && !autoStarted.current) { autoStarted.current = true; void pay(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, b?.id]);

  if (!bookingId) { router.replace('/(patient)/(tabs)'); return null; }
  if (booking.isLoading || !b) return <Screen title="Payment"><View style={{ gap: 12, marginTop: 12 }}><Skeleton height={96} rounded={16} /><Skeleton height={56} rounded={16} /></View></Screen>;

  const last = attempts.data?.[0];
  const failedBefore = !!last && ['failed', 'cancelled'].includes(last.status) && !waiting;
  const label = waiting ? 'Waiting for confirmation…' : failedBefore || tried ? 'Try again' : `Pay ${formatMYR(b.total_amount)}`;

  return (
    <Screen title="Payment" back footer={
      notConfigured ? (
        <Button label="View my booking" onPress={() => router.replace({ pathname: '/booking/[id]', params: { id: b.id } })} />
      ) : (
        <>
          <Button label={label} icon="lock-closed" loading={busy || waiting} disabled={hold.expired} onPress={pay} />
          <Text variant="caption" color="textMuted" align="center">Payments are processed securely by our payment partner. BeVital never sees your card or bank details.</Text>
        </>
      )
    }>
      <View style={{ gap: 16, marginTop: 8 }}>
        <View style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.primaryLight }}>
          <View>
            <Text variant="caption" color="inkSoft">Amount due</Text>
            <Text variant="title" color="primaryDark">{formatMYR(b.total_amount)}</Text>
          </View>
          {hold.seconds != null && !hold.expired ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="caption" color="inkSoft">Slot held for</Text>
              <Text variant="heading" color={hold.seconds < 120 ? 'danger' : 'ink'}>{hold.label}</Text>
            </View>
          ) : null}
        </View>

        {hold.expired ? <Banner tone="danger" icon="timer-outline" title="Your hold has expired" body="The slot was released. Please start again to pick a time." /> : null}
        {failedBefore && !hold.expired ? <Banner tone="warning" icon="alert-circle-outline" title="Payment didn't go through" body="Nothing was charged. You can try again, or pick another way to pay." /> : null}

        {notConfigured ? (
          <Banner tone="warning" icon="construct-outline" title="Online payments aren't switched on yet" body="Your slot is held for a short time, but this app can't take payment until BeVital connects its payment provider. Nothing has been charged and your booking will not be confirmed until payment is verified." />
        ) : (
          <View style={{ gap: 10 }}>
            <Text variant="subheading">Pay with</Text>
            <ChipRow>
              {METHODS.map((m) => <Chip key={m.id} label={m.label} icon={m.icon} selected={method === m.id} onPress={() => setMethod(m.id)} />)}
            </ChipRow>
          </View>
        )}
      </View>
    </Screen>
  );
}

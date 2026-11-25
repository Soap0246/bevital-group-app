import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { formatMYR, friendlyError, type PaymentMethod } from '@bevital/shared';
import { startCheckout, useBooking } from '@/api/bookings';
import { BookStep } from '@/components/domain/BookStep';
import { PaymentMethodList } from '@/components/domain/PaymentMethods';
import { Banner, Button, Card, LoadingList, Text, useToast } from '@/components/ui';
import { useBookingDraft } from '@/lib/bookingDraft';
import { useCountdown } from '@/hooks/useCountdown';

/** Step 7 — pay. The app only ever opens the provider's hosted checkout; it can never mark a payment as paid. */
export default function Payment() {
  const router = useRouter();
  const toast = useToast();
  const { draft } = useBookingDraft();
  const { bookingId: paramId } = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = paramId ?? draft.bookingId ?? undefined;
  const booking = useBooking(bookingId);
  const [method, setMethod] = useState<PaymentMethod>('fpx');
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const hold = useCountdown(booking.data?.status === 'pending' ? booking.data.hold_expires_at : null);

  // After the checkout window closes, poll until the verified webhook has moved the booking forward.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void booking.refetch(), 3000);
    const stop = setTimeout(() => setWaiting(false), 120_000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [waiting, booking]);

  useEffect(() => {
    const s = booking.data?.status;
    if (s && s !== 'pending') router.replace('/book/confirmation');
  }, [booking.data?.status, router]);

  if (!bookingId) { router.replace('/(patient)/(tabs)'); return null; }
  if (booking.isLoading || !booking.data) return <BookStep step={7} title="Payment"><LoadingList count={2} /></BookStep>;
  const b = booking.data;

  const pay = async () => {
    setBusy(true);
    try {
      const r = await startCheckout({ bookingId: b.id, method });
      if (!r.providerConfigured) { setNotConfigured(true); return; }
      if (!r.checkoutUrl) throw new Error('The payment provider did not return a checkout link.');
      setWaiting(true);
      await WebBrowser.openBrowserAsync(r.checkoutUrl);
      void booking.refetch();
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BookStep step={7} title="Payment" footer={
      notConfigured ? (
        <Button label="View my booking" onPress={() => router.replace({ pathname: '/booking/[id]', params: { id: b.id } })} />
      ) : (
        <>
          <Button label={waiting ? 'Waiting for confirmation…' : `Pay ${formatMYR(b.total_amount)}`} icon="lock-closed" loading={busy || waiting} disabled={hold.expired} onPress={pay} />
          <Text variant="caption" color="textSubtle" align="center">Payments are processed securely by our payment partner. BeVital never sees your card or banking details.</Text>
        </>
      )
    }>
      <Card tone="tinted">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text variant="caption" color="inkSoft">Amount due</Text>
            <Text variant="display" color="primaryDark">{formatMYR(b.total_amount)}</Text>
          </View>
          {hold.seconds != null ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="caption" color="inkSoft">Slot held for</Text>
              <Text variant="title" color={hold.seconds < 120 ? 'danger' : 'ink'}>{hold.label}</Text>
            </View>
          ) : null}
        </View>
      </Card>

      {hold.expired ? <Banner tone="danger" icon="timer-outline" title="Your hold has expired" body="The slot was released. Please start again to pick a time." /> : null}

      {notConfigured ? (
        <Banner tone="warning" icon="construct-outline" title="Online payments aren't switched on yet" body="Your slot is held for a short time, but this app can't take payment until BeVital connects its payment provider. Nothing has been charged and your booking will not be confirmed until payment is verified." />
      ) : (
        <View style={{ gap: 10 }}>
          <Text variant="subheading">Choose how to pay</Text>
          <PaymentMethodList value={method} onChange={setMethod} />
        </View>
      )}
    </BookStep>
  );
}

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { formatMYR } from '@bevital/shared';
import { colors } from '@/theme';
import { Button, Screen, Text } from '@/components/ui';

export const BOOKING_STEPS = 4;

interface BookStepProps {
  step: number;
  title: string;
  children: React.ReactNode;
  /** running price shown in the sticky bar */
  price?: number | null;
  /** "From" for an estimate, "Total" once it is exact */
  priceLabel?: string;
  cta?: string;
  onNext?: () => void;
  nextDisabled?: boolean;
  loading?: boolean;
  /** small line above the sticky bar button (e.g. chosen time) */
  note?: string;
}

/** Frame for each booking step: progress bar and a sticky bar with the running price and the primary action. */
export function BookStep({ step, title, children, price, priceLabel = 'Total', cta = 'Continue', onNext, nextDisabled, loading, note }: BookStepProps) {
  const footer = onNext ? (
    <>
      {note ? <Text variant="caption" color="textMuted" numberOfLines={1}>{note}</Text> : null}
      <View style={styles.bar}>
        {price != null ? (
          <View style={styles.price} accessible accessibilityLabel={`${priceLabel} ${formatMYR(price)}`}>
            <Text variant="label" color="textMuted">{priceLabel.toUpperCase()}</Text>
            <Text variant="heading">{formatMYR(price)}</Text>
          </View>
        ) : null}
        <Button label={cta} onPress={onNext} disabled={nextDisabled} loading={loading} fullWidth={false} style={{ flex: 1 }} />
      </View>
    </>
  ) : undefined;

  return (
    <Screen title={title} subtitle={`Step ${step} of ${BOOKING_STEPS}`} footer={footer}>
      <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityLabel={`Step ${step} of ${BOOKING_STEPS}`} accessibilityValue={{ min: 0, max: BOOKING_STEPS, now: step }}>
        {Array.from({ length: BOOKING_STEPS }).map((_, i) => <View key={i} style={[styles.seg, i < step && styles.segOn]} />)}
      </View>
      <View style={{ gap: 16, paddingTop: 16 }}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 6, marginTop: 4 },
  seg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border },
  segOn: { backgroundColor: colors.lime },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  price: { minWidth: 96 },
});

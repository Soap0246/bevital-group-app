import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { Screen } from '@/components/ui';

export const BOOKING_STEPS = 7;

/** Frame for each booking step: title, "Step n of 7" and a progress bar, with the primary action pinned below. */
export function BookStep({
  step, title, children, footer,
}: { step: number; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Screen title={title} subtitle={`Step ${step} of ${BOOKING_STEPS}`} footer={footer}>
      <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: BOOKING_STEPS, now: step }}>
        <View style={[styles.fill, { width: `${(step / BOOKING_STEPS) * 100}%` }]} />
      </View>
      <View style={{ gap: 16, paddingTop: 8 }}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: colors.primaryLight, overflow: 'hidden', marginTop: 4 },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});

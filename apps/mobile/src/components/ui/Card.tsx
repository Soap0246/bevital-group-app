import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow } from '@/theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  elevated?: boolean;
  tone?: 'default' | 'tinted' | 'dark';
  padding?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function Card({ children, onPress, elevated = true, tone = 'default', padding = 16, style, accessibilityLabel, accessibilityHint }: CardProps) {
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { padding },
    tone === 'tinted' && { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
    tone === 'dark' && { backgroundColor: colors.ink, borderColor: colors.ink },
    tone === 'default' && { borderColor: colors.border },
    elevated && tone === 'default' ? shadow.card : null,
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [base, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

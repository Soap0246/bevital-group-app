import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radius, shadow, TOUCH_TARGET } from '@/theme';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'md' | 'lg';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
}

const palette: Record<Variant, { bg: string; fg: 'surface' | 'primaryDark' | 'primary' | 'danger' | 'text'; border?: string }> = {
  primary: { bg: colors.primary, fg: 'surface' },
  secondary: { bg: colors.primaryLight, fg: 'primaryDark' },
  outline: { bg: 'transparent', fg: 'primary', border: colors.primary },
  ghost: { bg: 'transparent', fg: 'primary' },
  danger: { bg: colors.dangerLight, fg: 'danger' },
};

export function Button({
  label, onPress, variant = 'primary', size = 'lg', icon, iconRight, loading, disabled, fullWidth = true, style, accessibilityHint, testID,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: size === 'lg' ? TOUCH_TARGET + 4 : TOUCH_TARGET - 6,
          backgroundColor: p.bg,
          borderColor: p.border ?? 'transparent',
          opacity: inactive ? 0.55 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        variant === 'primary' && !inactive ? shadow.card : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[p.fg]} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={p.fg} /> : null}
          <Text variant="button" color={p.fg}>{label}</Text>
          {iconRight ? <Icon name={iconRight} size={20} color={p.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

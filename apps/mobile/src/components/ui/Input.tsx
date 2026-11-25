import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fontFamily, radius, TOUCH_TARGET } from '@/theme';
import { useA11y } from '@/lib/a11y';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: IconName;
  /** adds a show/hide toggle for passwords */
  secure?: boolean;
}

export const Input = forwardRef<React.ComponentRef<typeof TextInput>, InputProps>(function Input(
  { label, error, hint, icon, secure, multiline, onFocus, onBlur, ...rest }, ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const { textScale } = useA11y();
  return (
    <View style={styles.wrap}>
      {label ? <Text variant="label" color="inkSoft" style={styles.label}>{label}</Text> : null}
      <View style={[styles.field, focused && styles.focused, !!error && styles.errored, multiline && styles.multiline]}>
        {icon ? <Icon name={icon} size={20} color="textMuted" /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label ?? rest.placeholder}
          placeholderTextColor={colors.textSubtle}
          secureTextEntry={secure ? hidden : rest.secureTextEntry}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[styles.input, { fontSize: 16 * textScale }, multiline && { minHeight: 96 }]}
          {...rest}
        />
        {secure ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={22} color="textMuted" />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text variant="caption" color="danger" accessibilityLiveRegion="polite">{error}</Text> : hint ? <Text variant="caption" color="textMuted">{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { textTransform: 'uppercase' },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH_TARGET + 2, paddingHorizontal: 16,
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: 12 },
  focused: { borderColor: colors.primary, backgroundColor: colors.primaryLight + '55' },
  errored: { borderColor: colors.danger },
  input: { flex: 1, color: colors.text, fontFamily: fontFamily.regular, paddingVertical: 10 },
});

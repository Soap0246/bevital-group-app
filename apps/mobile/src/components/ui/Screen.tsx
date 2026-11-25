import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors } from '@/theme';
import { Text } from './Text';
import { Icon } from './Icon';

interface ScreenProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** show a back arrow (default true when a title is given) */
  back?: boolean;
  right?: React.ReactNode;
  /** custom header replacing the title bar (e.g. logo header) */
  header?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** pinned to the bottom (primary action) */
  footer?: React.ReactNode;
  background?: string;
  contentStyle?: StyleProp<ViewStyle>;
  /** let a <Hero/> reach under the status bar (the hero adds its own top inset) */
  bleedTop?: boolean;
}

export function Screen({
  children, title, subtitle, back, right, header, scroll = true, padded = true, refreshing, onRefresh, footer, background = colors.surfaceAlt, contentStyle, bleedTop,
}: ScreenProps) {
  const router = useRouter();
  const showBack = back ?? Boolean(title);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const body = (
    <View style={[padded && styles.padded, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: background }]} edges={bleedTop ? ['left', 'right', 'bottom'] : ['top', 'left', 'right', 'bottom']}>
      {header ?? (title || showBack || right ? (
        <View style={styles.header}>
          {showBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} hitSlop={8} style={styles.back}>
              <Icon name="chevron-back" size={26} />
            </Pressable>
          ) : null}
          <View style={styles.titleWrap}>
            {title ? <Text variant="heading" numberOfLines={1} accessibilityRole="header">{title}</Text> : null}
            {subtitle ? <Text variant="caption" color="textMuted" numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <View style={styles.right}>{right}</View>
        </View>
      ) : null)}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={{ paddingBottom: footer ? 24 : 40, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} /> : undefined}
          >
            {body}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{body}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  padded: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, minHeight: 60, gap: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, paddingHorizontal: 8 },
  right: { minWidth: 48, alignItems: 'flex-end' },
  footer: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border, gap: 8,
  },
});

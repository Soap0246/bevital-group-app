import React, { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { friendlyError } from '@bevital/shared';
import { colors, radius } from '@/theme';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';

export function Skeleton({ width = '100%', height = 16, rounded = 8, style }: { width?: DimensionValue; height?: number; rounded?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(reduce ? 0.8 : 0.5);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [o, reduce]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: rounded, backgroundColor: colors.border }, anim, style]} />;
}

/** Card-shaped loading placeholder. */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.skelCard} accessibilityLabel="Loading" accessible>
      <Skeleton width="55%" height={18} />
      {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} width={i === lines - 1 ? '40%' : '90%'} height={14} />)}
    </View>
  );
}

export function LoadingList({ count = 3 }: { count?: number }) {
  return <View style={{ gap: 12 }}>{Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}</View>;
}

export function EmptyState({ icon = 'leaf-outline', title, body, actionLabel, onAction }: { icon?: IconName; title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.center} accessibilityRole="summary">
      <View style={styles.iconWrap}><Icon name={icon} size={34} color="primary" /></View>
      <Text variant="heading" align="center">{title}</Text>
      {body ? <Text color="textMuted" align="center">{body}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} fullWidth={false} size="md" style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry, title = "We couldn't load this" }: { error?: unknown; onRetry?: () => void; title?: string }) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.iconWrap, { backgroundColor: colors.dangerLight }]}><Icon name="cloud-offline-outline" size={32} color="danger" /></View>
      <Text variant="heading" align="center">{title}</Text>
      <Text color="textMuted" align="center">{friendlyError(error)}</Text>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} fullWidth={false} size="md" style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

/** Convenience wrapper: loading → error → empty → content. */
export function QueryBoundary<T>({
  query, children, empty, skeleton,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => React.ReactNode;
  empty?: { when?: (d: T) => boolean; node: React.ReactNode };
  skeleton?: React.ReactNode;
}) {
  if (query.isLoading) return <>{skeleton ?? <LoadingList />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  if (empty && (empty.when ? empty.when(data) : Array.isArray(data) && data.length === 0)) return <>{empty.node}</>;
  return <>{children(data)}</>;
}

const styles = StyleSheet.create({
  skelCard: { gap: 10, padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  center: { alignItems: 'center', gap: 10, paddingVertical: 40, paddingHorizontal: 24 },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});

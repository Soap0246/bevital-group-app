import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND } from '@bevital/shared';
import { colors } from '@/theme';
import { Logo, Text, Card, Icon } from '@/components/ui';

/** Premium splash: Logo A (main corporate logo) with a subtle loading bar. */
export function SplashView({ message }: { message?: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [progress]);
  const bar = useAnimatedStyle(() => ({
    width: `${20 + progress.value * 60}%`,
    marginLeft: `${progress.value * 20}%`,
    opacity: 0.4 + progress.value * 0.6,
  }));
  return (
    <SafeAreaView style={styles.splash}>
      <Animated.View entering={FadeIn.duration(500)} style={styles.splashCenter}>
        <Logo variant="main" height={170} />
        <Text variant="caption" color="textMuted" style={{ letterSpacing: 1.6 }}>{BRAND.tagline.toUpperCase()}</Text>
      </Animated.View>
      <View style={styles.track} accessible accessibilityLabel={message ?? 'Loading'} accessibilityRole="progressbar">
        <Animated.View style={[styles.bar, bar]} />
      </View>
    </SafeAreaView>
  );
}

export function FullScreenLoader() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

/** Shown when EXPO_PUBLIC_SUPABASE_* are missing — never makes network calls to a placeholder backend. */
export function SetupScreen() {
  return (
    <SafeAreaView style={styles.setup}>
      <Logo variant="main" height={96} />
      <Card style={{ marginTop: 24 }}>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Icon name="construct-outline" size={24} color="warning" />
            <Text variant="heading">Backend not configured</Text>
          </View>
          <Text color="textMuted">Set these environment variables, then restart Expo:</Text>
          <Text variant="caption" style={styles.code}>EXPO_PUBLIC_SUPABASE_URL{'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>
          <Text color="textMuted">Copy apps/mobile/.env.example to apps/mobile/.env. See docs/DEPLOYMENT.md for the Supabase setup.</Text>
        </View>
      </Card>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  splashCenter: { alignItems: 'center', gap: 18, flex: 1, justifyContent: 'center' },
  track: { width: 140, height: 4, borderRadius: 2, backgroundColor: colors.primaryLight, overflow: 'hidden', marginBottom: 56 },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  setup: { flex: 1, padding: 24, backgroundColor: colors.background },
  code: { fontFamily: 'monospace', backgroundColor: colors.surfaceAlt, padding: 12, borderRadius: 10 },
});

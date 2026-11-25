import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
import { Logo } from './Misc';

/** Deep-green gradient header that bleeds under the status bar, with soft decorative shapes. Use with <Screen bleedTop>. */
export function Hero({ children, bottom = 56 }: { children: React.ReactNode; bottom?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={['#234A08', colors.primary, '#6AA32A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ marginHorizontal: -20, paddingHorizontal: 20, paddingTop: insets.top + 10, paddingBottom: bottom, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', right: -50, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: colors.lime, opacity: 0.22 }} />
      <View pointerEvents="none" style={{ position: 'absolute', right: 70, bottom: -90, width: 170, height: 170, borderRadius: 85, backgroundColor: '#FFFFFF', opacity: 0.07 }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: -40, bottom: -50, width: 120, height: 120, borderRadius: 60, backgroundColor: colors.lime, opacity: 0.14 }} />
      {children}
    </LinearGradient>
  );
}

/** The BeVital lock-up on a white pill so it stays legible on the green hero. */
export function HeroLogo() {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
      <Logo variant="nolb" height={30} />
    </View>
  );
}

import React, { useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BRAND } from '@bevital/shared';
import { colors } from '@/theme';
import { Button, Icon, Logo, Text, type IconName } from '@/components/ui';
import { ONBOARDING_KEY } from '@/config/storageKeys';

const SLIDES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'flash', title: 'Book a physiotherapist in minutes', body: 'Choose your service, pick a time that works for you and see only the physiotherapists who are genuinely available.' },
  { icon: 'home', title: 'At home or at our clinic', body: 'Get expert treatment where you are most comfortable — we come to you, or you visit a BeVital clinic.' },
  { icon: 'trending-up', title: 'Track your recovery', body: 'Follow your goals, do your home exercises with video guides, and watch your progress build session by session.' },
  { icon: 'people', title: 'Care for the whole family', body: 'Manage appointments for your children, parents and loved ones from one account — with their consent and your control.' },
];

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const onViewable = useRef<NonNullable<React.ComponentProps<typeof FlatList>['onViewableItemsChanged']>>(({ viewableItems }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  const go = async (path: '/(auth)/register' | '/(auth)/login') => {
    try { await AsyncStorage.setItem(ONBOARDING_KEY, '1'); } catch { /* ignore */ }
    router.replace(path);
  };

  return (
    <SafeAreaView style={styles.root}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.logo}>
        <Logo variant="main" height={124} />
      </Animated.View>

      <FlatList
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <View style={styles.hero}><Icon name={item.icon} size={72} color="primary" /></View>
            <Text variant="title" align="center">{item.title}</Text>
            <Text color="textMuted" align="center">{item.body}</Text>
          </View>
        )}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ alignItems: 'center' }}
        accessibilityLabel="Introduction to BeVital"
      />

      <View style={styles.dots} accessible accessibilityLabel={`Page ${index + 1} of ${SLIDES.length}`}>
        {SLIDES.map((s, i) => <View key={s.title} style={[styles.dot, i === index && styles.dotOn]} />)}
      </View>

      <View style={styles.actions}>
        <Button label="Create account" onPress={() => go('/(auth)/register')} />
        <Button label="I already have an account" variant="outline" onPress={() => go('/(auth)/login')} />
        <Text variant="caption" color="textSubtle" align="center" style={{ marginTop: 6 }}>{BRAND.fullTagline}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  logo: { alignItems: 'center', paddingTop: 20 },
  hero: { width: 168, height: 168, borderRadius: 84, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotOn: { width: 26, backgroundColor: colors.primary },
  actions: { paddingHorizontal: 24, paddingBottom: 20, gap: 12 },
});

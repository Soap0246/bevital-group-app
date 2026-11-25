import React from 'react';
import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily } from '@/theme';
import { Icon, type IconName } from '@/components/ui';

const tab = (name: string, title: string, icon: IconName, iconOn: IconName) => ({
  name, title,
  options: {
    title,
    tabBarIcon: ({ focused }: { focused: boolean }) => (
      <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.primaryLight : 'transparent' }}>
        <Icon name={focused ? iconOn : icon} size={22} color={focused ? 'primary' : 'textMuted'} />
      </View>
    ),
    tabBarAccessibilityLabel: `${title} tab`,
  },
});

/** Patient bottom navigation: Home · Services · Visits · Recovery · Profile */
export default function PatientTabs() {
  const insets = useSafeAreaInsets();
  const tabs = [
    tab('index', 'Home', 'home-outline', 'home'),
    tab('services', 'Services', 'grid-outline', 'grid'),
    tab('bookings', 'Visits', 'calendar-outline', 'calendar'),
    tab('recovery', 'Recovery', 'pulse-outline', 'pulse'),
    tab('profile', 'Profile', 'person-outline', 'person'),
  ];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, marginTop: 2 },
        tabBarStyle: { height: 68 + Math.max(insets.bottom, 12), paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, boxShadow: '0 -8px 24px rgba(59,109,17,0.10)', shadowColor: '#3B6D11', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: -4 }, elevation: 12 } as never,
      }}
    >
      {tabs.map((t) => <Tabs.Screen key={t.name} name={t.name} options={t.options} />)}
    </Tabs>
  );
}

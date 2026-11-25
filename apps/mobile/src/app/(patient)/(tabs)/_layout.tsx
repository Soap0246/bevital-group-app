import React from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily } from '@/theme';
import { Icon, type IconName } from '@/components/ui';

const tab = (name: string, title: string, icon: IconName, iconOn: IconName) => ({
  name, title,
  options: {
    title,
    tabBarIcon: ({ focused }: { focused: boolean }) => <Icon name={focused ? iconOn : icon} size={24} color={focused ? 'primary' : 'textMuted'} />,
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
        tabBarStyle: { height: 60 + Math.max(insets.bottom, 10), paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
      }}
    >
      {tabs.map((t) => <Tabs.Screen key={t.name} name={t.name} options={t.options} />)}
    </Tabs>
  );
}

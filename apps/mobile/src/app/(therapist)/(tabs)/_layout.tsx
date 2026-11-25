import React from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily } from '@/theme';
import { Icon, type IconName } from '@/components/ui';

const tab = (name: string, title: string, icon: IconName, iconOn: IconName) => ({
  name,
  options: {
    title,
    tabBarIcon: ({ focused }: { focused: boolean }) => <Icon name={focused ? iconOn : icon} size={24} color={focused ? 'primary' : 'textMuted'} />,
    tabBarAccessibilityLabel: `${title} tab`,
  },
});

/** Physiotherapist bottom navigation: Today · Calendar · Patients · Earnings · Profile */
export default function TherapistTabs() {
  const insets = useSafeAreaInsets();
  const tabs = [
    tab('index', 'Today', 'today-outline', 'today'),
    tab('calendar', 'Calendar', 'calendar-outline', 'calendar'),
    tab('patients', 'Patients', 'people-outline', 'people'),
    tab('earnings', 'Earnings', 'wallet-outline', 'wallet'),
    tab('profile', 'Profile', 'person-outline', 'person'),
  ];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, marginTop: 2 },
        tabBarStyle: { height: 68 + Math.max(insets.bottom, 12), paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
      }}
    >
      {tabs.map((t) => <Tabs.Screen key={t.name} name={t.name} options={t.options} />)}
    </Tabs>
  );
}

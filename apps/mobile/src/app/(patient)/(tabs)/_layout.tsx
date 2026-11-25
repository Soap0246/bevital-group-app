import React from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily } from '@/theme';
import { Icon, type IconName } from '@/components/ui';
import { useA11y } from '@/lib/a11y';

const tab = (name: string, title: string, icon: IconName, iconOn: IconName) => ({
  name, title,
  options: {
    title,
    tabBarIcon: ({ focused }: { focused: boolean }) => <Icon name={focused ? iconOn : icon} size={26} color={focused ? 'primary' : 'textMuted'} />,
    tabBarAccessibilityLabel: `${title} tab`,
  },
});

/** Patient bottom navigation: Home · Services · Bookings · My Recovery · Profile */
export default function PatientTabs() {
  const insets = useSafeAreaInsets();
  const { textScale } = useA11y();
  const tabs = [
    tab('index', 'Home', 'home-outline', 'home'),
    tab('services', 'Services', 'grid-outline', 'grid'),
    tab('bookings', 'Bookings', 'calendar-outline', 'calendar'),
    tab('recovery', 'My Recovery', 'pulse-outline', 'pulse'),
    tab('profile', 'Profile', 'person-outline', 'person'),
  ];
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: fontFamily.semibold, fontSize: 11.5 * textScale, marginTop: 2 },
        tabBarStyle: { height: 74 + insets.bottom, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 14), borderTopWidth: 0, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, shadowColor: '#10261A', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: -6 }, elevation: 14 },
      }}
    >
      {tabs.map((t) => <Tabs.Screen key={t.name} name={t.name} options={t.options} />)}
    </Tabs>
  );
}

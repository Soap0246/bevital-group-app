import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNotifications } from '@/api/profile';
import { Icon, Logo, Text } from '@/components/ui';
import { colors } from '@/theme';

/** Logo B + notification bell, shared by the signed-in tab headers. */
export function BrandHeader() {
  const router = useRouter();
  const n = useNotifications();
  const unread = (n.data ?? []).filter((x) => !x.read_at).length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
      <Logo variant="nolb" height={42} />
      <Pressable accessibilityRole="button" accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'} onPress={() => router.push('/notifications')}
        style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="notifications-outline" size={24} />
        {unread > 0 ? <View style={{ position: 'absolute', top: 8, right: 9, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text variant="label" color="surface" style={{ fontSize: 10, lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</Text></View> : null}
      </Pressable>
    </View>
  );
}

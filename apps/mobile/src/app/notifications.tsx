import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDateTime, type NotificationType } from '@bevital/shared';
import { useMarkNotificationsRead, useNotifications } from '@/api/profile';
import { Button, Card, EmptyState, ErrorState, Icon, LoadingList, Screen, Text, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

const ICON: Record<NotificationType, IconName> = {
  booking_confirmation: 'calendar-outline', appointment_reminder: 'alarm-outline', payment_confirmation: 'card-outline', therapist_assignment: 'person-outline',
  home_visit_update: 'navigate-outline', exercise_reminder: 'fitness-outline', package_expiry: 'ticket-outline', promotion: 'pricetag-outline', system: 'information-circle-outline',
};

/** Shared by patients and therapists (a top-level route, outside both role groups' tab bars). */
export default function Notifications() {
  const router = useRouter();
  const { role } = useAuth();
  const list = useNotifications();
  const mark = useMarkNotificationsRead();
  const unread = (list.data ?? []).filter((n) => !n.read_at);

  const open = (n: NonNullable<typeof list.data>[number]) => {
    if (!n.read_at) mark.mutate([n.id]);
    const bookingId = (n.data as { booking_id?: string } | null)?.booking_id;
    if (bookingId) router.push({ pathname: role === 'therapist' ? '/visit/[id]' : '/booking/[id]', params: { id: bookingId } });
  };

  return (
    <Screen title="Notifications" right={unread.length ? <Button label="Mark all read" variant="ghost" size="md" fullWidth={false} onPress={() => mark.mutate(undefined)} /> : undefined} refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
      <View style={{ gap: 10, marginTop: 8 }}>
        {list.isLoading ? <LoadingList /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (list.data ?? []).length === 0 ? (
          <EmptyState icon="notifications-outline" title="You're all caught up" body="Booking updates, reminders and payment confirmations appear here." />
        ) : (list.data ?? []).map((n) => (
          <Card key={n.id} onPress={() => open(n)} style={!n.read_at ? { borderColor: colors.primary, backgroundColor: colors.primaryLight + '66' } : undefined}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}><Icon name={ICON[n.type]} size={20} color="primary" /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{n.title}</Text>
                <Text variant="caption" color="inkSoft">{n.body}</Text>
                <Text variant="caption" color="textSubtle">{formatDateTime(n.created_at)}</Text>
              </View>
              {!n.read_at ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 }} /> : null}
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

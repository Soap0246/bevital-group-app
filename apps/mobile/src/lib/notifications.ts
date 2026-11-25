import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '@/config/env';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export type PushStatus = 'registered' | 'denied' | 'unsupported' | 'missing-project-id';

/**
 * Registers this device for remote push and stores the Expo push token against the signed-in user
 * (push_tokens, RLS: own rows only). A server-side sender (Edge Function `send-push`, triggered by new
 * rows in `notifications`) delivers the messages — see docs/DEPLOYMENT.md.
 *
 * Needs a physical device and an EAS project id; remote push is not available in Expo Go on Android.
 */
export async function registerForPush(userId: string): Promise<PushStatus> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'BeVital', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#0E7C86' });
  }
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return 'denied';

  const projectId = env.easProjectId || (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return 'missing-project-id';
  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, platform: Platform.OS === 'ios' ? 'ios' : 'android', last_seen_at: new Date().toISOString() },
      { onConflict: 'token' },
    );
    return 'registered';
  } catch {
    return 'unsupported';
  }
}

// ───────────────────────── Local exercise reminders ─────────────────────────
const REMINDER_KEY = 'bevital.exerciseReminder';

export interface ReminderSetting { enabled: boolean; hour: number; minute: number }

export async function getExerciseReminder(): Promise<ReminderSetting> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_KEY);
    if (raw) return JSON.parse(raw) as ReminderSetting;
  } catch { /* fall through */ }
  return { enabled: false, hour: 18, minute: 0 };
}

/** Schedules (or cancels) a daily on-device reminder. Works offline; no server needed. */
export async function setExerciseReminder(setting: ReminderSetting): Promise<'ok' | 'denied' | 'unsupported'> {
  if (Platform.OS === 'web') return 'unsupported';
  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify(setting));
  if (!setting.enabled) return 'ok';
  const perm = await Notifications.requestPermissionsAsync();
  if (perm.status !== 'granted') return 'denied';
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Time for your BeVital exercises', body: 'A few minutes today keeps your recovery on track.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: setting.hour, minute: setting.minute },
  });
  return 'ok';
}

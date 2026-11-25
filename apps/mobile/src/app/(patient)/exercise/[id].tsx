import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { VideoView, useVideoPlayer } from 'expo-video';
import { friendlyError, type ExerciseItemRow } from '@bevital/shared';
import { unwrap } from '@/api/catalog';
import { useCompleteExercise } from '@/api/recovery';
import { Banner, Button, Card, EmptyState, Icon, LoadingList, Screen, Text, useToast } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/theme';

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: '#000' }} nativeControls contentFit="contain" />;
}

/** Exercise instructions and demonstration video (https links only). */
export default function ExerciseDetail() {
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const complete = useCompleteExercise();
  const [pain, setPain] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ['exercise-item', id],
    enabled: !!id,
    queryFn: async () => unwrap(await supabase.from('exercise_programme_items').select('*, programme:exercise_programmes(title, status)').eq('id', id!).maybeSingle()) as unknown as (ExerciseItemRow & { programme: { title: string; status: string } | null }) | null,
  });
  const it = q.data;

  if (q.isLoading) return <Screen title="Exercise"><LoadingList count={1} /></Screen>;
  if (!it) return <Screen title="Exercise"><EmptyState title="Exercise not found" /></Screen>;
  const safeVideo = it.video_url && /^https:\/\//i.test(it.video_url) ? it.video_url : null;

  return (
    <Screen title={it.name} subtitle={it.programme?.title} footer={
      <Button label="Mark as done" icon="checkmark-circle" loading={complete.isPending} onPress={async () => {
        try { await complete.mutateAsync({ itemId: it.id, painLevel: pain }); toast.show('Exercise logged. Well done!'); } catch (e) { toast.show(friendlyError(e), 'error'); }
      }} />
    }>
      {safeVideo ? <Player uri={safeVideo} /> : <Banner tone="neutral" icon="videocam-off-outline" title="No video for this exercise yet" body="Follow the written instructions below, or ask your physiotherapist to demonstrate at your next session." />}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
        {[['Sets', it.sets], ['Reps', it.reps], ['Hold', it.hold_seconds ? `${it.hold_seconds}s` : null]].filter(([, v]) => v != null).map(([label, v]) => (
          <Card key={String(label)} style={{ flex: 1, alignItems: 'center' }}><Text variant="title" color="primaryDark">{String(v)}</Text><Text variant="caption" color="textMuted">{String(label)}</Text></Card>
        ))}
      </View>
      <Text variant="heading" style={{ marginTop: 20, marginBottom: 6 }}>How to do it</Text>
      <Text color="inkSoft">{it.instructions ?? 'Your physiotherapist will show you how to perform this exercise.'}</Text>

      <Text variant="subheading" style={{ marginTop: 20, marginBottom: 8 }}>Pain while exercising (optional)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 11 }, (_, n) => (
          <Pressable key={n} onPress={() => setPain(pain === n ? null : n)} accessibilityRole="button" accessibilityState={{ selected: pain === n }} accessibilityLabel={`Pain ${n}`}
            style={{ width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: pain === n ? colors.primary : colors.surfaceAlt }}>
            <Text variant="bodyStrong" color={pain === n ? 'surface' : 'ink'}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'flex-start' }}>
        <Icon name="warning-outline" size={20} color="warning" />
        <Text variant="caption" color="textMuted" style={{ flex: 1 }}>Stop and contact your physiotherapist if you feel sharp, worsening pain, dizziness or numbness.</Text>
      </View>
    </Screen>
  );
}

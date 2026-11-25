import React, { useState } from 'react';
import { View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { friendlyError, therapistProfileSchema } from '@bevital/shared';
import { useUpdateTherapistProfile } from '@/api/therapist';
import { Avatar, Banner, Button, Input, Screen, Text, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadPrivateFile } from '@/lib/upload';

const split = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export default function EditTherapistProfile() {
  const toast = useToast();
  const { profile, therapist, session, refreshProfile } = useAuth();
  const update = useUpdateTherapistProfile();
  const [f, setF] = useState({
    headline: therapist?.headline ?? '', bio: therapist?.bio ?? '', years: therapist?.years_experience != null ? String(therapist.years_experience) : '',
    quals: (therapist?.qualifications ?? []).join('\n'), langs: (therapist?.languages ?? []).join(', '),
  });
  const [err, setErr] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    setPhotoBusy(true);
    try {
      const path = await uploadPrivateFile('therapist-photos', session!.user.id, { uri: a.uri, name: a.fileName ?? 'photo.jpg', mimeType: a.mimeType ?? 'image/jpeg' });
      const { data } = supabase.storage.from('therapist-photos').getPublicUrl(path);
      const { error } = await supabase.from('users').update({ avatar_url: data.publicUrl }).eq('id', session!.user.id);
      if (error) throw new Error(error.message);
      await refreshProfile();
      toast.show('Photo updated');
    } catch (e) { toast.show(friendlyError(e), 'error'); } finally { setPhotoBusy(false); }
  };

  const save = async () => {
    setErr(null);
    const parsed = therapistProfileSchema.safeParse({ headline: f.headline, bio: f.bio, yearsExperience: f.years === '' ? undefined : f.years, qualifications: split(f.quals), languages: split(f.langs) });
    if (!parsed.success) { setErr(parsed.error.issues[0]?.message ?? 'Check the form'); return; }
    const v = parsed.data;
    try {
      await update.mutateAsync({ headline: v.headline || null, bio: v.bio || null, years_experience: v.yearsExperience ?? null, qualifications: v.qualifications, languages: v.languages });
      toast.show('Profile saved');
    } catch (e) { setErr(friendlyError(e)); }
  };

  return (
    <Screen title="Edit profile" footer={<Button label="Save profile" loading={update.isPending} onPress={save} />}>
      <View style={{ alignItems: 'center', gap: 10, marginVertical: 12 }}>
        <Avatar name={profile?.full_name ?? '?'} uri={therapist?.avatar_url} size={96} />
        <Button label="Change photo" variant="secondary" size="md" fullWidth={false} loading={photoBusy} icon="camera-outline" onPress={pickPhoto} />
        <Text variant="caption" color="textMuted" align="center">Your photo is shown publicly to patients. Use a clear, professional headshot.</Text>
      </View>
      {err ? <Banner tone="danger" icon="alert-circle" title={err} /> : null}
      <View style={{ gap: 14, marginTop: 8 }}>
        <Input label="Headline" value={f.headline} onChangeText={(t) => setF({ ...f, headline: t })} placeholder="e.g. Sports & musculoskeletal physiotherapist" />
        <Input label="About you" multiline value={f.bio} onChangeText={(t) => setF({ ...f, bio: t })} placeholder="Your approach, special interests…" />
        <Input label="Years of experience" value={f.years} onChangeText={(t) => setF({ ...f, years: t })} keyboardType="number-pad" />
        <Input label="Qualifications (one per line)" multiline value={f.quals} onChangeText={(t) => setF({ ...f, quals: t })} placeholder="BSc Physiotherapy — University of …" />
        <Input label="Languages (comma separated)" value={f.langs} onChangeText={(t) => setF({ ...f, langs: t })} placeholder="English, Bahasa Malaysia, Mandarin" />
        <Banner tone="info" icon="lock-closed-outline" title="Managed by BeVital" body="Your name, verification status, rating and clinic assignment are controlled by BeVital and can't be edited here." />
      </View>
    </Screen>
  );
}

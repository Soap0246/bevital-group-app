import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { friendlyError, reviewSchema } from '@bevital/shared';
import { useBooking, useSubmitReview } from '@/api/bookings';
import { Button, Card, EmptyState, Input, LoadingList, Screen, StarPicker, Text, useToast } from '@/components/ui';

export default function ReviewScreen() {
  const router = useRouter();
  const toast = useToast();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const booking = useBooking(bookingId);
  const submit = useSubmitReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const b = booking.data;

  if (booking.isLoading) return <Screen title="Rate your session"><LoadingList count={1} /></Screen>;
  if (!b?.therapist) return <Screen title="Rate your session"><EmptyState title="Nothing to review" /></Screen>;

  const send = async () => {
    const parsed = reviewSchema.safeParse({ rating, comment });
    if (!parsed.success) { toast.show(parsed.error.issues[0]?.message ?? 'Choose a rating', 'error'); return; }
    try {
      await submit.mutateAsync({ bookingId: b.id, therapistId: b.therapist!.id, rating, comment });
      toast.show('Thank you for your feedback!');
      router.back();
    } catch (e) { toast.show(friendlyError(e), 'error'); }
  };

  return (
    <Screen title="Rate your session" footer={<Button label="Submit review" loading={submit.isPending} onPress={send} />}>
      <Card style={{ alignItems: 'center', gap: 10, marginTop: 8 }}>
        <Text variant="heading" align="center">How was your session with {b.therapist.display_name}?</Text>
        <StarPicker value={rating} onChange={setRating} />
        <Text variant="caption" color="textMuted">{['Tap to rate', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][rating]}</Text>
      </Card>
      <Input label="Tell us more (optional)" multiline value={comment} onChangeText={setComment} placeholder="What went well? What could be better?" />
      <Text variant="caption" color="textSubtle" style={{ marginTop: 8 }}>Your review is shown publicly as "Verified patient" without your name.</Text>
    </Screen>
  );
}

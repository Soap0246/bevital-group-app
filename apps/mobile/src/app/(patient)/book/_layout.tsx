import React from 'react';
import { Stack } from 'expo-router';
import { BookingDraftProvider } from '@/lib/bookingDraft';

/** All booking steps share one draft so the user can go back and change anything without losing the rest. */
export default function BookLayout() {
  return (
    <BookingDraftProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </BookingDraftProvider>
  );
}

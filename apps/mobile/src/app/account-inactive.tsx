import React from 'react';
import { Button, EmptyState, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@bevital/shared';

export default function AccountInactive() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <EmptyState icon="lock-closed-outline" title="Account unavailable" body={`This account has been deactivated. Please contact ${BRAND.supportEmail} if you think this is a mistake.`} />
      <Button label="Log out" variant="outline" onPress={signOut} />
    </Screen>
  );
}

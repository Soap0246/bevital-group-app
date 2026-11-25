import React from 'react';
import { View } from 'react-native';
import { Button, EmptyState, Logo, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function AdminNotice() {
  const { signOut } = useAuth();
  return (
    <Screen header={<View style={{ alignItems: 'center', paddingTop: 16 }}><Logo variant="nolb" height={44} /></View>}>
      <EmptyState icon="desktop-outline" title="Admins use the web dashboard" body="Administrator accounts manage BeVital from the admin web portal, not the mobile app." />
      <Button label="Log out" variant="outline" onPress={signOut} />
    </Screen>
  );
}

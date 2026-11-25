import React from 'react';
import { View } from 'react-native';
import { Logo, Screen, Text } from '@/components/ui';

/** Shared frame for signed-out screens: Logo A at the top, title, content. */
export function AuthShell({ title, subtitle, children, back = false }: { title: string; subtitle?: string; children: React.ReactNode; back?: boolean }) {
  return (
    <Screen back={back} title={back ? '' : undefined}>
      <View style={{ alignItems: 'center', marginTop: back ? 0 : 16, marginBottom: 24 }}>
        <Logo variant="main" height={56} />
      </View>
      <View style={{ gap: 6, marginBottom: 24 }}>
        <Text variant="title" accessibilityRole="header">{title}</Text>
        {subtitle ? <Text color="textMuted">{subtitle}</Text> : null}
      </View>
      <View style={{ gap: 16 }}>{children}</View>
    </Screen>
  );
}

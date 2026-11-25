import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ColorToken } from '@bevital/shared';
import { colors } from '@/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 22, color = 'text' }: { name: IconName; size?: number; color?: ColorToken }) {
  return <Ionicons name={name} size={size} color={colors[color]} accessible={false} />;
}

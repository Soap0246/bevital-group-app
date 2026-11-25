/**
 * BeVital brand tokens shared by the mobile app and the admin dashboard.
 * Palette derived from the official BeVital logos (fresh green on white) with accessible contrast.
 * Logos themselves live in each app's branding config and are never redrawn.
 */
export const BRAND = {
  name: 'BeVital',
  tagline: 'No One Left Behind',
  /** Combined lock-up used in copy, never as a replacement for the logo artwork. */
  fullTagline: 'BeVital – No One Left Behind',
  timezone: 'Asia/Kuala_Lumpur',
  currency: 'MYR',
  country: 'MY',
  supportEmail: 'support@bevital.example',
} as const;

export const COLORS = {
  // Brand greens (sampled from the official logos: #94C01C stacked emblem, #8CC440 lock-up)
  lime: '#8CC440',
  limeLight: '#F3F9E6',
  // Primary action colour: a deeper green so white text passes WCAG AA (5.1:1). The logo lime
  // itself is too light for text/buttons on white, so it is used for accents and highlights.
  primary: '#4C7A12',
  primaryDark: '#365B0B',
  primaryLight: '#EEF6DC',
  primaryMuted: '#A9D26B',
  // Deep forest ink for headings and dark surfaces
  ink: '#10261A',
  inkSoft: '#2F4A38',
  // Neutrals (warm-green tinted)
  text: '#1C3326',
  textMuted: '#566A5B',
  textSubtle: '#8A9C8F',
  border: '#E3EBDD',
  borderStrong: '#C9D6C0',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F9F0',
  background: '#FFFFFF',
  // Warm accent for promotions / highlights
  accent: '#F2A33A',
  accentLight: '#FEF3E1',
  // Semantic
  success: '#12906A',
  successLight: '#E1F5EE',
  warning: '#C97F0A',
  warningLight: '#FDF1DC',
  danger: '#D64545',
  dangerLight: '#FCE9E9',
  info: '#2F7FD1',
  infoLight: '#E6F0FB',
} as const;

export type ColorToken = keyof typeof COLORS;

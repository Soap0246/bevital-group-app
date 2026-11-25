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
  lime: '#8CC63F',
  limeLight: '#F1F8E3',
  // Primary action colour: a deeper green so white text passes WCAG AA (5.1:1). The logo lime
  // itself is too light for text/buttons on white, so it is used for accents and highlights.
  primary: '#3B6D11',
  primaryDark: '#2C5209',
  primaryLight: '#E9F3D6',
  primaryMuted: '#A9D26B',
  // Deep forest ink for headings and dark surfaces
  ink: '#1C2A12',
  inkSoft: '#3A4A2C',
  // Neutrals (warm-green tinted)
  text: '#1C2A12',
  textMuted: '#55624B',
  textSubtle: '#6B7860',
  border: '#DDE6CF',
  borderStrong: '#C3D1AE',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F8EE',
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

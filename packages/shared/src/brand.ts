/**
 * BeVital brand tokens shared by the mobile app and the admin dashboard.
 *
 * ⚠️  PROVISIONAL COLOURS — the official BeVital corporate palette has not been
 * supplied yet. These values are a neutral, premium healthcare palette used so the
 * UI is coherent during development. Replace the values below with the official
 * brand colours (one place, both apps pick them up).
 *
 * Logos are NOT defined here. Each app has its own `branding` config that points at
 * the official logo files supplied by BeVital (see apps/mobile/src/config/branding.ts
 * and apps/admin/src/config/branding.ts).
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
  // Primary
  primary: '#0E7C86',
  primaryDark: '#0A5A62',
  primaryLight: '#E3F4F5',
  primaryMuted: '#7FC3C9',
  // Deep ink used for headings and the dark surfaces
  ink: '#0B2A3C',
  inkSoft: '#35505F',
  // Neutrals
  text: '#17303F',
  textMuted: '#5C7280',
  textSubtle: '#8CA0AC',
  border: '#E3EAEE',
  borderStrong: '#CBD7DE',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F8FA',
  background: '#FFFFFF',
  // Accent used sparingly for promotions / highlights
  accent: '#F2A33A',
  accentLight: '#FEF3E1',
  // Semantic
  success: '#1F9D6B',
  successLight: '#E4F6EE',
  warning: '#D98A0B',
  warningLight: '#FDF1DC',
  danger: '#D64545',
  dangerLight: '#FCE9E9',
  info: '#2F7FD1',
  infoLight: '#E6F0FB',
} as const;

export type ColorToken = keyof typeof COLORS;

import type { ImageSourcePropType } from 'react-native';
import { BRAND } from '@bevital/shared';

/**
 * CENTRAL BRANDING CONFIGURATION
 * ------------------------------
 * Both official BeVital logos are referenced from here and nowhere else — swap the files in
 * `assets/brand/` (see the README there) and update the two entries below.
 *
 *  LOGO A  `main`  — BeVital main corporate logo
 *          Used on: splash/loading, onboarding, login, registration, password screens.
 *  LOGO B  `nolb`  — BeVital "No One Left Behind" logo
 *          Used on: the authenticated app (home dashboard, headers, profile, therapist app).
 *
 * Do not recreate, restyle or re-type the logos. `isPlaceholder: true` makes the <Logo/> component
 * draw a clearly-labelled dashed frame instead of pretending to be artwork.
 */
export interface LogoConfig {
  source: ImageSourcePropType;
  /** width ÷ height of the supplied artwork */
  aspectRatio: number;
  /** true until the official artwork replaces the placeholder file */
  isPlaceholder: boolean;
  accessibilityLabel: string;
}

export const branding = {
  name: BRAND.name,
  tagline: BRAND.tagline,
  logos: {
    main: {
      source: require('../../assets/brand/logo-main.png'),
      aspectRatio: 0.849,
      isPlaceholder: false,
      accessibilityLabel: 'BeVital',
    },
    nolb: {
      source: require('../../assets/brand/logo-no-one-left-behind.png'),
      aspectRatio: 4.405,
      isPlaceholder: false,
      accessibilityLabel: 'BeVital — No One Left Behind',
    },
  } satisfies Record<'main' | 'nolb', LogoConfig>,
} as const;

export type LogoVariant = keyof typeof branding.logos;

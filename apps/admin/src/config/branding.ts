import { BRAND } from "@bevital/shared";

/**
 * CENTRAL BRANDING CONFIGURATION (admin portal)
 *
 *  LOGO A  `main`  — BeVital main corporate logo → sign-in screen
 *  LOGO B  `nolb`  — BeVital "No One Left Behind" logo → everywhere inside the signed-in portal
 *
 * Replace the files in /public/brand with the official artwork, set `isPlaceholder: false` and the
 * `aspectRatio` (width ÷ height). Never redraw or re-type the logos.
 */
export interface LogoConfig {
  src: string;
  aspectRatio: number;
  isPlaceholder: boolean;
  alt: string;
}

export const branding = {
  name: BRAND.name,
  tagline: BRAND.tagline,
  logos: {
    main: { src: "/brand/logo-main.png", aspectRatio: 3.2, isPlaceholder: true, alt: "BeVital" },
    nolb: { src: "/brand/logo-no-one-left-behind.png", aspectRatio: 3.2, isPlaceholder: true, alt: "BeVital — No One Left Behind" },
  } satisfies Record<"main" | "nolb", LogoConfig>,
} as const;

export type LogoVariant = keyof typeof branding.logos;

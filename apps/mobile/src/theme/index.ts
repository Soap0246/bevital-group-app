import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { COLORS } from '@bevital/shared';

export const colors = COLORS;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Minimum touch target (elderly / limited-dexterity friendly; WCAG recommends ≥ 44). */
export const TOUCH_TARGET = 52;

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'button';

/** Base sizes ≥ 16 for body copy. Scaled further by the "Larger text" accessibility preference. */
export const typography: Record<TextVariant, TextStyle> = {
  display: { fontFamily: fontFamily.extrabold, fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  title: { fontFamily: fontFamily.bold, fontSize: 24, lineHeight: 32, letterSpacing: -0.3 },
  heading: { fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 28 },
  subheading: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.4 },
  button: { fontFamily: fontFamily.bold, fontSize: 17, lineHeight: 22 },
};

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B2A3C', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 3 },
    default: { boxShadow: '0 6px 18px rgba(11,42,60,0.08)' } as ViewStyle,
  }) as ViewStyle,
  float: Platform.select<ViewStyle>({
    ios: { shadowColor: '#0B2A3C', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
    android: { elevation: 8 },
    default: { boxShadow: '0 10px 28px rgba(11,42,60,0.16)' } as ViewStyle,
  }) as ViewStyle,
};

export const toneColors = {
  warning: { bg: colors.warningLight, fg: colors.warning },
  info: { bg: colors.infoLight, fg: colors.info },
  primary: { bg: colors.primaryLight, fg: colors.primaryDark },
  success: { bg: colors.successLight, fg: colors.success },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
} as const;

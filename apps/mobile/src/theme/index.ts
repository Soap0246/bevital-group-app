import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import { COLORS } from '@bevital/shared';

export const colors = COLORS;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 40 } as const;

export const radius = { sm: 12, md: 14, lg: 16, xl: 20, pill: 999 } as const;

/** Minimum touch target (elderly / limited-dexterity friendly; WCAG recommends ≥ 44). */
export const TOUCH_TARGET = 48;

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
  display: { fontFamily: fontFamily.extrabold, fontSize: 26, lineHeight: 34, letterSpacing: -0.4 },
  title: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 34, letterSpacing: -0.4 },
  heading: { fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 26 },
  subheading: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 22 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fontFamily.semibold, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.3 },
  button: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 20 },
};

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: '#3B6D11', shadowOpacity: 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 3 },
    default: { boxShadow: '0 6px 20px rgba(59,109,17,0.09), 0 1px 3px rgba(28,42,18,0.05)' } as ViewStyle,
  }) as ViewStyle,
  float: Platform.select<ViewStyle>({
    ios: { shadowColor: '#1C2A12', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 3 },
    default: { boxShadow: '0 12px 32px rgba(59,109,17,0.18)' } as ViewStyle,
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

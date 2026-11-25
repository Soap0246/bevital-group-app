import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import type { ColorToken } from '@bevital/shared';
import { colors, typography, type TextVariant } from '@/theme';
import { useA11y } from '@/lib/a11y';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
}

/** All copy goes through <Text/> so typography, colour and the "Larger text" preference stay consistent. */
export function Text({ variant = 'body', color = 'text', align, style, children, ...rest }: TextProps) {
  const { textScale } = useA11y();
  const base = typography[variant];
  return (
    <RNText
      {...rest}
      style={[
        base,
        {
          color: colors[color],
          fontSize: (base.fontSize ?? 16) * textScale,
          lineHeight: (base.lineHeight ?? 24) * textScale,
          textAlign: align,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

/**
 * Themed Text primitive. Use instead of react-native's Text so every string
 * in the app draws from the type scale and color tokens.
 *
 *   <AppText variant="title">Notes</AppText>
 *   <AppText variant="secondary" color="muted">2 h ago</AppText>
 */
import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { useTheme, TypeVariant, ThemeColors } from '../../theme';

type TextTone = 'default' | 'secondary' | 'muted' | 'faint' | 'accent' | 'error' | 'inverse';

const toneToken: Record<TextTone, keyof ThemeColors> = {
  default: 'text',
  secondary: 'textSecondary',
  muted: 'textMuted',
  faint: 'textFaint',
  accent: 'accent',
  error: 'error',
  inverse: 'onPrimary',
};

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: TextTone;
  align?: TextStyle['textAlign'];
}

export function AppText({
  variant = 'body',
  color = 'default',
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const { colors, type } = useTheme();
  return (
    <Text
      style={[type[variant], { color: colors[toneToken[color]] }, align && { textAlign: align }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

/**
 * 44pt icon button with required accessibility label.
 */
import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Radius } from '../../theme';
import { AppPressable } from './Pressable';

export interface AppIconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'plain' | 'tonal' | 'outline';
  size?: number;
  color?: string;
  style?: ViewStyle;
  disabled?: boolean;
}

export function AppIconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'plain',
  size = 20,
  color,
  style,
  disabled,
}: AppIconButtonProps) {
  const { colors } = useTheme();
  const backgroundColor =
    variant === 'tonal' ? colors.bgMuted : variant === 'outline' ? colors.bgSurface : 'transparent';

  return (
    <AppPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.base,
        { backgroundColor },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? colors.textMuted} />
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

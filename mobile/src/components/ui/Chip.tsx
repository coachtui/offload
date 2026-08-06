/**
 * AppChip — selectable filter chip (single-line filter rows, category pickers).
 * AppBadge — static tinted label (category tags on cards, statuses).
 */
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Fonts, Radius, ThemeColors } from '../../theme';
import { AppText } from './Text';
import { AppPressable } from './Pressable';

export interface AppChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  style?: ViewStyle;
}

export function AppChip({ label, selected, onPress, icon, count, style }: AppChipProps) {
  const { colors } = useTheme();
  return (
    <AppPressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.bgSurface,
          borderColor: selected ? colors.accent : colors.border,
        },
        style,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={selected ? colors.onPrimary : colors.textMuted}
          style={styles.icon}
        />
      ) : null}
      <AppText
        variant="secondary"
        style={{ color: selected ? colors.onPrimary : colors.textMuted, fontFamily: Fonts.semibold }}
      >
        {label}
        {typeof count === 'number' ? `  ${count}` : ''}
      </AppText>
    </AppPressable>
  );
}

export type BadgeTone = 'accent' | 'success' | 'warning' | 'error' | 'neutral';

const toneMap: Record<BadgeTone, { bg: keyof ThemeColors; fg: keyof ThemeColors }> = {
  accent: { bg: 'accentLight', fg: 'accent' },
  success: { bg: 'successBg', fg: 'success' },
  warning: { bg: 'warningBg', fg: 'warning' },
  error: { bg: 'errorBg', fg: 'error' },
  neutral: { bg: 'bgMuted', fg: 'textMuted' },
};

export interface AppBadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: ViewStyle;
}

export function AppBadge({ label, tone = 'neutral', style }: AppBadgeProps) {
  const { colors } = useTheme();
  const t = toneMap[tone];
  return (
    <View style={[styles.badge, { backgroundColor: colors[t.bg] }, style]}>
      <AppText variant="label" style={{ color: colors[t.fg], fontSize: 10, lineHeight: 13 }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  icon: { marginRight: 5 },
  badge: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
});

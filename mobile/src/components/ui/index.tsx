/**
 * Shared UI primitives for Offload
 * Use these across all screens for consistent styling.
 *
 * All components draw from the active theme (light/dark) via useThemedStyles.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  lightColors,
  Spacing,
  Radius,
  Fonts,
  Elevation,
  ThemeColors,
  useTheme,
  useThemedStyles,
} from '../../theme';

// ─── Design tokens ────────────────────────────────────────────────────────────
// Canonical definitions live in src/theme. `Colors` is kept as a legacy alias
// for the light palette; theme-aware code should use useTheme() instead.

export const Colors = lightColors;
export { Spacing, Radius };

// ─── Primitives ───────────────────────────────────────────────────────────────

export { AppText } from './Text';
export { AppPressable } from './Pressable';
export { AppInput } from './Input';
export { AppChip, AppBadge } from './Chip';
export { AppIconButton } from './IconButton';
export { AppSkeleton, SkeletonCard } from './Skeleton';
export { AppSheet, ConfirmSheet } from './Sheet';
export { ToastProvider, useToast } from './Toast';

// ─── AppScreen ────────────────────────────────────────────────────────────────
// Wraps content in a SafeAreaView with the standard background.

interface AppScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

const createScreenStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
    },
  });

export function AppScreen({ children, style, edges = ['top'] }: AppScreenProps) {
  const styles = useThemedStyles(createScreenStyles);
  return (
    <SafeAreaView style={[styles.container, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

// ─── AppHeader ────────────────────────────────────────────────────────────────
// Standard 3-column header: [left] [title/subtitle] [right]

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  border?: boolean;
  titleAlign?: 'left' | 'center';
}

const createHeaderStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.xxl,
      paddingVertical: Spacing.lg,
      backgroundColor: c.bg,
    },
    border: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    sideSlot: { minWidth: 56 },
    rightSlot: { alignItems: 'flex-end' },
    center: { flex: 1, alignItems: 'center' },
    centerLeft: { alignItems: 'flex-start', paddingLeft: Spacing.sm },
    title: {
      fontSize: 17,
      fontFamily: Fonts.semibold,
      color: c.text,
      letterSpacing: -0.2,
    },
    subtitle: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      marginTop: 2,
    },
  });

export function AppHeader({
  title,
  subtitle,
  left,
  right,
  border = true,
  titleAlign = 'center',
}: AppHeaderProps) {
  const styles = useThemedStyles(createHeaderStyles);
  return (
    <View style={[styles.container, border && styles.border]}>
      <View style={styles.sideSlot}>{left ?? <View />}</View>
      <View style={[styles.center, titleAlign === 'left' && styles.centerLeft]}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.sideSlot, styles.rightSlot]}>{right ?? <View />}</View>
    </View>
  );
}

// ─── AppCard ──────────────────────────────────────────────────────────────────
// Standard rounded card with surface background.

interface AppCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

const createCardStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.lg,
      padding: Spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      ...Elevation.level1,
    },
  });

export function AppCard({ children, onPress, style }: AppCardProps) {
  const styles = useThemedStyles(createCardStyles);
  if (onPress) {
    return (
      <TouchableOpacity style={[styles.card, style]} onPress={onPress} activeOpacity={0.72}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── AppSearchBar ─────────────────────────────────────────────────────────────
// Consistent search input with leading icon, clear button, and loading state.

interface AppSearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: ViewStyle;
  loading?: boolean;
  onSubmit?: () => void;
}

const createSearchStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderRadius: Radius.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    leadingIcon: {
      marginRight: Spacing.sm,
    },
    input: {
      flex: 1,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.text,
    },
  });

export function AppSearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  autoFocus,
  style,
  loading,
  onSubmit,
}: AppSearchBarProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createSearchStyles);
  return (
    <View style={[styles.container, style]}>
      {loading ? (
        <ActivityIndicator size="small" color={colors.textFaint} style={styles.leadingIcon} />
      ) : (
        <Ionicons name="search" size={17} color={colors.textFaint} style={styles.leadingIcon} />
      )}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={17} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── AppSection ───────────────────────────────────────────────────────────────
// Titled section wrapper with optional action in the header row.

interface AppSectionProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  style?: ViewStyle;
}

const createSectionStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { marginBottom: Spacing.xxl },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    title: {
      fontSize: 13,
      fontFamily: Fonts.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
  });

export function AppSection({ title, children, action, style }: AppSectionProps) {
  const styles = useThemedStyles(createSectionStyles);
  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {action ?? null}
      </View>
      {children}
    </View>
  );
}

// ─── AppButton ────────────────────────────────────────────────────────────────
// Consistent button in primary, secondary, ghost, or accent variant.

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
}

const createBtnStyles = (c: ThemeColors) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: Radius.md,
    },
    disabled: { opacity: 0.45 },
    label: { fontSize: 15, fontFamily: Fonts.semibold },
    // variants
    primary: { backgroundColor: c.primary },
    secondary: {
      backgroundColor: c.bgMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    ghost: { backgroundColor: 'transparent' },
    accent: {
      backgroundColor: c.accentLight,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    // sizes
    sm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
    md: { paddingHorizontal: Spacing.lg, paddingVertical: 11 },
    lg: { paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md },
    // labels
    label_primary: { color: c.onPrimary },
    label_secondary: { color: c.text },
    label_ghost: { color: c.accent },
    label_accent: { color: c.accent },
  });

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  style,
}: AppButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createBtnStyles);
  const iconColor =
    variant === 'primary' ? colors.onPrimary : variant === 'accent' ? colors.accent : colors.text;

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], styles[size], disabled && styles.disabled, style]}
      onPress={onPress}
      activeOpacity={0.78}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={size === 'sm' ? 15 : 17}
          color={iconColor}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text style={[styles.label, styles[`label_${variant}`]]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── ListRow ──────────────────────────────────────────────────────────────────
// A single list item row with title, optional subtitle, meta text, and slots.

interface ListRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  showChevron?: boolean;
}

const createRowStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Spacing.md,
      paddingHorizontal: Spacing.xxl,
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    leftSlot: { marginRight: Spacing.md },
    body: { flex: 1 },
    title: { fontSize: 15, fontFamily: Fonts.medium, color: c.text },
    subtitle: { fontSize: 13, fontFamily: Fonts.regular, color: c.textMuted, marginTop: 2, lineHeight: 18 },
    rightSlot: { marginLeft: Spacing.sm, alignItems: 'flex-end', flexDirection: 'row', gap: 4 },
    meta: { fontSize: 12, fontFamily: Fonts.regular, color: c.textFaint },
  });

export function ListRow({
  title,
  subtitle,
  meta,
  left,
  right,
  onPress,
  style,
  showChevron,
}: ListRowProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createRowStyles);
  const content = (
    <View style={[styles.container, style]}>
      {left ? <View style={styles.leftSlot}>{left}</View> : null}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.rightSlot}>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {right ?? null}
        {showChevron ? (
          <Ionicons name="chevron-forward" size={16} color={colors.borderStrong} />
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
// Centered empty state with an optional icon, title, body text, and action.

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  text?: string;
  action?: React.ReactNode;
}

const createEmptyStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 48,
      paddingVertical: 64,
    },
    title: {
      fontSize: 18,
      fontFamily: Fonts.semibold,
      color: c.text,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center',
    },
    text: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: 21,
    },
    action: { marginTop: 24 },
  });

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createEmptyStyles);
  return (
    <View style={styles.container}>
      {icon ? <Ionicons name={icon} size={52} color={colors.border} /> : null}
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

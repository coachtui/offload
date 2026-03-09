/**
 * Shared UI primitives for Offload
 * Use these across all screens for consistent styling.
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

// ─── Design tokens ────────────────────────────────────────────────────────────

export const Colors = {
  bg: '#FFFFFF',
  bgSurface: '#F9FAFB',
  bgMuted: '#F3F4F6',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6B7280',
  textFaint: '#9CA3AF',
  primary: '#111827',
  accent: '#4F46E5',
  accentLight: '#EEF2FF',
  accentBorder: '#C7D2FE',
  error: '#DC2626',
  errorBg: '#FEE2E2',
  errorBorder: '#FECACA',
  warning: '#92400E',
  warningBg: '#FEF3C7',
  warningBorder: '#FDE68A',
  success: '#065F46',
  successBg: '#D1FAE5',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

// ─── AppScreen ────────────────────────────────────────────────────────────────
// Wraps content in a SafeAreaView with the standard background.

interface AppScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

export function AppScreen({ children, style, edges = ['top'] }: AppScreenProps) {
  return (
    <SafeAreaView style={[screenStyles.container, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});

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

export function AppHeader({
  title,
  subtitle,
  left,
  right,
  border = true,
  titleAlign = 'center',
}: AppHeaderProps) {
  return (
    <View style={[headerStyles.container, border && headerStyles.border]}>
      <View style={headerStyles.sideSlot}>{left ?? <View />}</View>
      <View style={[headerStyles.center, titleAlign === 'left' && headerStyles.centerLeft]}>
        <Text style={headerStyles.title}>{title}</Text>
        {subtitle ? <Text style={headerStyles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[headerStyles.sideSlot, headerStyles.rightSlot]}>{right ?? <View />}</View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.bg,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  sideSlot: { minWidth: 56 },
  rightSlot: { alignItems: 'flex-end' },
  center: { flex: 1, alignItems: 'center' },
  centerLeft: { alignItems: 'flex-start', paddingLeft: Spacing.sm },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
});

// ─── AppCard ──────────────────────────────────────────────────────────────────
// Standard rounded card with surface background.

interface AppCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export function AppCard({ children, onPress, style }: AppCardProps) {
  if (onPress) {
    return (
      <TouchableOpacity style={[cardStyles.card, style]} onPress={onPress} activeOpacity={0.72}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[cardStyles.card, style]}>{children}</View>;
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgSurface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
});

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

export function AppSearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  autoFocus,
  style,
  loading,
  onSubmit,
}: AppSearchBarProps) {
  return (
    <View style={[searchStyles.container, style]}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={Colors.textFaint}
          style={searchStyles.leadingIcon}
        />
      ) : (
        <Ionicons
          name="search"
          size={17}
          color={Colors.textFaint}
          style={searchStyles.leadingIcon}
        />
      )}
      <TextInput
        style={searchStyles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textFaint}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close-circle" size={17} color={Colors.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const searchStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgMuted,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  leadingIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
});

// ─── AppSection ───────────────────────────────────────────────────────────────
// Titled section wrapper with optional action in the header row.

interface AppSectionProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  style?: ViewStyle;
}

export function AppSection({ title, children, action, style }: AppSectionProps) {
  return (
    <View style={[sectionStyles.container, style]}>
      <View style={sectionStyles.header}>
        <Text style={sectionStyles.title}>{title}</Text>
        {action ?? null}
      </View>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: { marginBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

// ─── AppButton ────────────────────────────────────────────────────────────────
// Consistent button in primary, secondary, or ghost variant.

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  style?: ViewStyle;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  style,
}: AppButtonProps) {
  const iconColor =
    variant === 'primary'
      ? '#FFFFFF'
      : variant === 'accent'
      ? Colors.accent
      : Colors.text;

  return (
    <TouchableOpacity
      style={[
        btnStyles.base,
        btnStyles[variant],
        btnStyles[`size_${size}` as keyof typeof btnStyles],
        disabled && btnStyles.disabled,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.78}
      disabled={disabled}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={size === 'sm' ? 15 : 17}
          color={iconColor}
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text style={[btnStyles.label, btnStyles[`label_${variant}` as keyof typeof btnStyles]]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const btnStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  primary: { backgroundColor: Colors.primary },
  secondary: {
    backgroundColor: Colors.bgMuted,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ghost: { backgroundColor: 'transparent' },
  accent: {
    backgroundColor: Colors.accentLight,
    borderWidth: 1,
    borderColor: Colors.accentBorder,
  },
  size_sm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  size_md: { paddingHorizontal: Spacing.lg, paddingVertical: 11 },
  size_lg: { paddingHorizontal: Spacing.xxl, paddingVertical: Spacing.md },
  disabled: { opacity: 0.45 },
  label: { fontSize: 15, fontWeight: '600' },
  label_primary: { color: '#FFFFFF' },
  label_secondary: { color: Colors.text },
  label_ghost: { color: Colors.accent },
  label_accent: { color: Colors.accent },
});

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
  const content = (
    <View style={[rowStyles.container, style]}>
      {left ? <View style={rowStyles.leftSlot}>{left}</View> : null}
      <View style={rowStyles.body}>
        <Text style={rowStyles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={rowStyles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={rowStyles.rightSlot}>
        {meta ? <Text style={rowStyles.meta}>{meta}</Text> : null}
        {right ?? null}
        {showChevron ? (
          <Ionicons name="chevron-forward" size={16} color={Colors.borderStrong} />
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    backgroundColor: Colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  leftSlot: { marginRight: Spacing.md },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '500', color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2, lineHeight: 18 },
  rightSlot: { marginLeft: Spacing.sm, alignItems: 'flex-end', flexDirection: 'row', gap: 4 },
  meta: { fontSize: 12, color: Colors.textFaint },
});

// ─── EmptyState ───────────────────────────────────────────────────────────────
// Centered empty state with an optional icon, title, body text, and action.

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  text?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <View style={emptyStyles.container}>
      {icon ? <Ionicons name={icon} size={52} color={Colors.border} /> : null}
      <Text style={emptyStyles.title}>{title}</Text>
      {text ? <Text style={emptyStyles.text}>{text}</Text> : null}
      {action ? <View style={emptyStyles.action}>{action}</View> : null}
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 48,
    paddingVertical: 64,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  text: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  action: { marginTop: 24 },
});

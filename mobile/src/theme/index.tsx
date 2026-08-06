/**
 * Offload design tokens — "Deep Lagoon"
 *
 * Single source of truth for color, type, spacing, radius, elevation, and
 * motion. Screens and components must consume these via useTheme() (or the
 * legacy Colors/Spacing/Radius re-exports in components/ui) — never hardcode
 * hex values or one-off sizes.
 *
 * Both light and dark palettes are defined here; the app ships light-only
 * until the dark-mode phase flips the provider to follow the system scheme.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { TextStyle, ViewStyle, useColorScheme } from 'react-native';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

// ─── Color ────────────────────────────────────────────────────────────────────

export const lightColors = {
  // canvas & surfaces
  bg: '#F6F5F1',
  bgSurface: '#FFFFFF',
  bgMuted: '#EDEBE4',
  border: '#E8E6DF',
  borderStrong: '#D6D3C9',
  // text (green-cast ink, not gray)
  text: '#17211E',
  textSecondary: '#3D4A45',
  textMuted: '#5F6B66',
  textFaint: '#9AA39E',
  // actions
  primary: '#17211E',
  onPrimary: '#FFFFFF',
  accent: '#0F6B5F',
  accentLight: '#E4F0EC',
  accentBorder: '#BFDCD4',
  // the record action — the only place coral appears
  record: '#D23F28',
  recordBright: '#EC6A4A',
  recordLight: '#FAEEE9',
  // semantic
  error: '#C2492F',
  errorBg: '#FAEAE5',
  errorBorder: '#F0CFC5',
  warning: '#A1740C',
  warningBg: '#F7EFDD',
  warningBorder: '#EBDDB5',
  success: '#1E6B4F',
  successBg: '#E2F0E8',
  successBorder: '#C2DFD0',
} as const;

export type ThemeColors = { [K in keyof typeof lightColors]: string };

export const darkColors: ThemeColors = {
  bg: '#0E1413',
  bgSurface: '#17201E',
  bgMuted: '#1E2926',
  border: '#263230',
  borderStrong: '#34423E',
  text: '#EDEFEB',
  textSecondary: '#C3CBC5',
  textMuted: '#9BA6A0',
  textFaint: '#6F7B76',
  primary: '#EDEFEB',
  onPrimary: '#14201C',
  accent: '#53B8A5',
  accentLight: 'rgba(83, 184, 165, 0.14)',
  accentBorder: 'rgba(83, 184, 165, 0.35)',
  record: '#EC6A4A',
  recordBright: '#F28A6E',
  recordLight: 'rgba(236, 106, 74, 0.15)',
  error: '#E0755A',
  errorBg: 'rgba(224, 117, 90, 0.14)',
  errorBorder: 'rgba(224, 117, 90, 0.35)',
  warning: '#E5C078',
  warningBg: 'rgba(217, 164, 65, 0.14)',
  warningBorder: 'rgba(217, 164, 65, 0.35)',
  success: '#8FD4C6',
  successBg: 'rgba(83, 184, 165, 0.14)',
  successBorder: 'rgba(83, 184, 165, 0.35)',
};

// ─── Typography ───────────────────────────────────────────────────────────────

export const Fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/** Pass to useFonts() at app boot. */
export const fontMap = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

export const Type = {
  display: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: Fonts.bold,
    letterSpacing: -0.5,
  } as TextStyle,
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Fonts.bold,
    letterSpacing: -0.4,
  } as TextStyle,
  heading: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: Fonts.semibold,
    letterSpacing: -0.2,
  } as TextStyle,
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: Fonts.regular,
  } as TextStyle,
  secondary: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Fonts.medium,
  } as TextStyle,
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: Fonts.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  } as TextStyle,
} as const;

export type TypeVariant = keyof typeof Type;

// ─── Layout ───────────────────────────────────────────────────────────────────

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
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

/** Three-step shadow scale. Use level1 for cards, level2 for sheets/menus,
 *  level3 for the record FAB and other floating heroes. */
export const Elevation = {
  level1: {
    shadowColor: '#141C19',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  } as ViewStyle,
  level2: {
    shadowColor: '#141C19',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  } as ViewStyle,
  level3: {
    shadowColor: '#141C19',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 6,
  } as ViewStyle,
} as const;

// ─── Motion ───────────────────────────────────────────────────────────────────

/** Shared durations (ms) and spring config so every animation in the app has
 *  the same rhythm. exit ≈ 60–70% of enter. */
export const Motion = {
  fast: 150,
  base: 250,
  slow: 350,
  exit: 180,
  staggerStep: 40,
  spring: { damping: 18, stiffness: 220, mass: 1 },
  pressScale: 0.97,
} as const;

// ─── Theme context ────────────────────────────────────────────────────────────

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  type: typeof Type;
  spacing: typeof Spacing;
  radius: typeof Radius;
  elevation: typeof Elevation;
  motion: typeof Motion;
}

const buildTheme = (scheme: ColorScheme): Theme => ({
  scheme,
  colors: scheme === 'dark' ? darkColors : lightColors,
  type: Type,
  spacing: Spacing,
  radius: Radius,
  elevation: Elevation,
  motion: Motion,
});

const ThemeContext = createContext<Theme>(buildTheme('light'));

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Force a scheme (e.g. for previews/tests); defaults to following the system. */
  scheme?: ColorScheme;
}

export function ThemeProvider({ children, scheme }: ThemeProviderProps) {
  const system = useColorScheme();
  const resolved: ColorScheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const theme = useMemo(() => buildTheme(resolved), [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Theme-aware StyleSheet hook. Pass a MODULE-LEVEL factory so the memo holds:
 *
 *   const createStyles = (c: ThemeColors) => StyleSheet.create({ ... });
 *   // in the component:
 *   const styles = useThemedStyles(createStyles);
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [factory, colors]);
}

/**
 * Loading placeholder with a soft opacity pulse. Use instead of bare
 * ActivityIndicators for list/card content that takes >300ms.
 *
 *   <AppSkeleton height={16} width="60%" />
 *   <SkeletonCard lines={2} />
 */
import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme, Radius, Spacing } from '../../theme';

export interface AppSkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export function AppSkeleton({ width = '100%', height = 14, radius = Radius.sm, style }: AppSkeletonProps) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.bgMuted, opacity: pulse },
        style,
      ]}
    />
  );
}

/** Card-shaped skeleton matching AppCard metrics. */
export function SkeletonCard({ lines = 2, style }: { lines?: number; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.bgSurface, borderColor: colors.border },
        style,
      ]}
    >
      <AppSkeleton width="55%" height={13} />
      {Array.from({ length: lines }).map((_, i) => (
        <AppSkeleton key={i} width={i === lines - 1 ? '40%' : '90%'} height={11} style={styles.line} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
  },
  line: { marginTop: Spacing.sm + 2 },
});

/**
 * Standard touchable. Replaces ad-hoc TouchableOpacity usage so every
 * pressable element in the app shares the same feedback: a subtle scale
 * spring plus opacity dip, driven by the motion tokens.
 */
import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import { Motion } from '../../theme';
import { haptic } from '../../theme/haptics';

export interface AppPressableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Set false for rows/list items where scaling looks odd; keeps opacity dip. */
  scale?: boolean;
  /** Fire a haptic on press. Use 'tap' for primary actions; omit for rows/links. */
  haptic?: keyof typeof haptic;
  children?: React.ReactNode;
}

export function AppPressable({
  style,
  scale = true,
  haptic: hapticKind,
  onPress,
  children,
  disabled,
  ...rest
}: AppPressableProps) {
  const anim = useRef(new Animated.Value(0)).current;

  const animateTo = (value: number) =>
    Animated.spring(anim, {
      toValue: value,
      ...Motion.spring,
      useNativeDriver: true,
    }).start();

  const scaleValue = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, Motion.pressScale],
  });
  const opacityValue = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.82],
  });

  return (
    <Pressable
      onPressIn={() => animateTo(1)}
      onPressOut={() => animateTo(0)}
      onPress={(e) => {
        if (hapticKind) haptic[hapticKind]();
        onPress?.(e);
      }}
      disabled={disabled}
      {...rest}
    >
      <Animated.View
        style={[
          style,
          { opacity: opacityValue, transform: scale ? [{ scale: scaleValue }] : [] },
          disabled && { opacity: 0.45 },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

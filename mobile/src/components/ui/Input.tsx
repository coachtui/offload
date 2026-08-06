/**
 * Themed text field with a visible label, helper/error text below the field,
 * focus ring, and a show/hide toggle for passwords. Replaces the raw
 * TextInputs every form currently hand-styles.
 */
import React, { useState } from 'react';
import { View, TextInput, TextInputProps, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Fonts, Spacing, Radius } from '../../theme';
import { AppText } from './Text';

export interface AppInputProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export function AppInput({
  label,
  helper,
  error,
  containerStyle,
  secureTextEntry,
  onFocus,
  onBlur,
  ...rest
}: AppInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);

  const borderColor = error ? colors.error : focused ? colors.accent : colors.border;

  return (
    <View style={containerStyle}>
      {label ? (
        <AppText variant="secondary" color="secondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          { backgroundColor: colors.bgSurface, borderColor },
          focused && styles.fieldFocused,
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.text }]}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={hidden}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {secureTextEntry ? (
          <TouchableOpacity
            onPress={() => setHidden((h) => !h)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={19}
              color={colors.textFaint}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? (
        <AppText variant="secondary" color="error" style={styles.below} accessibilityRole="alert">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="secondary" color="muted" style={styles.below}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg - 2,
    minHeight: 48,
  },
  fieldFocused: { borderWidth: 1.5, paddingHorizontal: Spacing.lg - 2.5 },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    paddingVertical: 12,
  },
  below: { marginTop: 6 },
});

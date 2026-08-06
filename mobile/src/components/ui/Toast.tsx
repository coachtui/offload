/**
 * Toast system — replaces Alert.alert for transient feedback.
 *
 * Mount <ToastProvider> once near the app root, then:
 *
 *   const toast = useToast();
 *   toast.show({ message: 'Note archived', tone: 'success',
 *                action: { label: 'Undo', onPress: restore } });
 *
 * Toasts auto-dismiss (4s, longer when there's an action), never steal
 * focus, and stack newest-only.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Elevation, Fonts, Motion, Radius, Spacing } from '../../theme';
import { AppText } from './Text';
import { AppPressable } from './Pressable';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  description?: string;
  tone?: ToastTone;
  action?: { label: string; onPress: () => void };
  /** ms; defaults to 4000, or 6000 when an action is present */
  duration?: number;
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const toneIcon: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  neutral: 'information-circle',
  success: 'checkmark-circle',
  error: 'alert-circle',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    Animated.timing(progress, {
      toValue: 0,
      duration: Motion.exit,
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, [progress]);

  const show = useCallback(
    (options: ToastOptions) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast(options);
      Animated.spring(progress, { toValue: 1, ...Motion.spring, useNativeDriver: true }).start();
      const duration = options.duration ?? (options.action ? 6000 : 4000);
      hideTimer.current = setTimeout(hide, duration);
    },
    [hide, progress]
  );

  const tone: ToastTone = toast?.tone ?? 'neutral';
  const toneColor =
    tone === 'success' ? colors.success : tone === 'error' ? colors.error : colors.textMuted;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <View
          style={[styles.host, { bottom: insets.bottom + Spacing.lg }]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.toast,
              {
                backgroundColor: colors.bgSurface,
                borderColor: colors.border,
                opacity: progress,
                transform: [{ translateY }],
              },
              Elevation.level2,
            ]}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            <Ionicons name={toneIcon[tone]} size={20} color={toneColor} style={styles.icon} />
            <View style={styles.body}>
              <AppText variant="secondary" style={{ fontFamily: Fonts.semibold }} numberOfLines={2}>
                {toast.message}
              </AppText>
              {toast.description ? (
                <AppText variant="secondary" color="muted" numberOfLines={2} style={styles.desc}>
                  {toast.description}
                </AppText>
              ) : null}
            </View>
            {toast.action ? (
              <AppPressable
                onPress={() => {
                  toast.action?.onPress();
                  hide();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
              >
                <AppText variant="secondary" color="accent" style={{ fontFamily: Fonts.bold }}>
                  {toast.action.label}
                </AppText>
              </AppPressable>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg - 2,
  },
  icon: { marginRight: Spacing.sm + 2 },
  body: { flex: 1, marginRight: Spacing.sm },
  desc: { marginTop: 1 },
});

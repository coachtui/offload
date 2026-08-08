/**
 * Bottom sheet built on the native Modal: dimmed scrim, grabber, spring
 * slide-up, safe-area aware. Replaces raw <Modal> usage and — via
 * ConfirmSheet — the Alert.alert confirmation dialogs.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, Motion, Radius, Spacing } from '../../theme';
import { haptic } from '../../theme/haptics';
import { AppText } from './Text';
import { AppButton } from './index';

const SLIDE_DISTANCE = 480;

export interface AppSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Right-aligned element in the header row (e.g. a "Clear" action). */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  contentStyle?: ViewStyle;
}

export function AppSheet({ visible, onClose, title, headerRight, children, contentStyle }: AppSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, {
        toValue: 1,
        ...Motion.spring,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: Motion.exit,
        useNativeDriver: true,
      }).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!mounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SLIDE_DISTANCE, 0],
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bgSurface,
              paddingBottom: insets.bottom + Spacing.lg,
              transform: [{ translateY }],
            },
            contentStyle,
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />
          {title || headerRight ? (
            <View style={styles.header}>
              <AppText variant="heading">{title ?? ''}</AppText>
              {headerRight ?? null}
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export interface ConfirmSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Small print below the actions — version strings and the like. */
  footnote?: string;
}

/** Styled replacement for Alert.alert confirmation dialogs. */
export function ConfirmSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  footnote,
}: ConfirmSheetProps) {
  const { colors } = useTheme();

  useEffect(() => {
    if (visible && destructive) haptic.warning();
  }, [visible, destructive]);

  return (
    <AppSheet visible={visible} onClose={onClose} title={title}>
      {message ? (
        <AppText variant="body" color="muted" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        <AppButton label={cancelLabel} variant="secondary" onPress={onClose} style={styles.action} />
        <AppButton
          label={confirmLabel}
          variant="primary"
          onPress={() => {
            onClose();
            onConfirm();
          }}
          style={
            destructive ? { ...styles.action, backgroundColor: colors.error } : styles.action
          }
        />
      </View>
      {footnote ? (
        <AppText variant="secondary" color="faint" align="center" style={styles.footnote}>
          {footnote}
        </AppText>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 15, 13, 0.5)' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    maxHeight: '85%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  message: { marginBottom: Spacing.xl },
  actions: { flexDirection: 'row', gap: Spacing.md },
  footnote: { marginTop: Spacing.lg },
  action: { flex: 1 },
});

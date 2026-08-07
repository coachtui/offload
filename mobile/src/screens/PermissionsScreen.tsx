/**
 * Stage 1 of the permission ladder — shown once, right after sign-up.
 *
 * Asks for microphone, "While Using" location, and notifications. Deliberately
 * does NOT ask for "Always" location: iOS gives that dialog one shot, and firing
 * it before the user has recorded anything spends it on someone with no reason
 * to say yes. That ask lives in ArrivalPermissionSheet, where a real place is
 * on screen to justify it.
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { AppText, AppButton, AppPressable, Spacing, Radius } from '../components/ui';
import { Fonts, ThemeColors, useTheme, useThemedStyles } from '../theme';
import { haptic } from '../theme/haptics';
import {
  requestFoundationalPermissions,
  setPermissionOnboardingComplete,
  getPermissionSnapshot,
  PermissionSnapshot,
} from '../services/permissionService';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Permissions'>;

interface Props {
  navigation: Nav;
}

interface PermissionRow {
  key: keyof PermissionSnapshot;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

const ROWS: PermissionRow[] = [
  {
    key: 'microphone',
    icon: 'mic',
    title: 'Microphone',
    body: 'So you can talk instead of type. Offload is built for getting a thought out in one breath.',
  },
  {
    key: 'locationWhenInUse',
    icon: 'location',
    title: 'Location',
    body: 'So "grab milk at Safeway" finds the Safeway near you — not one in another state.',
  },
  {
    key: 'notifications',
    icon: 'notifications',
    title: 'Notifications',
    body: 'So Offload can tap you on the shoulder at the moment a note actually matters.',
  },
];

export function PermissionsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PermissionSnapshot | null>(null);

  async function finish() {
    await setPermissionOnboardingComplete();
    navigation.replace('Home');
  }

  // Sign-out clears the onboarding flag (so a second tester on the same phone
  // gets the ladder), but iOS keeps its answers. Someone signing back in has
  // already granted everything — pass them straight through rather than showing
  // a screen whose buttons would open no dialogs.
  useEffect(() => {
    let cancelled = false;
    getPermissionSnapshot()
      .then((s) => {
        if (cancelled) return;
        if (s.microphone && s.locationWhenInUse && s.notifications) {
          void finish();
        }
      })
      .catch(() => {
        /* fall through to the normal flow */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinue() {
    haptic.tap();
    setBusy(true);
    try {
      const snapshot = await requestFoundationalPermissions();
      setResult(snapshot);
      // Straight through when everything landed — a "you're all set" step the
      // user has to tap past is just a speed bump.
      const allGranted =
        snapshot.microphone && snapshot.locationWhenInUse && snapshot.notifications;
      if (allGranted) {
        haptic.success();
        await finish();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    haptic.tap();
    await finish();
  }

  // After a partial grant we stay put and show what's missing, so a declined
  // permission is visible rather than a mystery later.
  const declined = result
    ? ROWS.filter((r) => !result[r.key])
    : [];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandBlock}>
          <View style={styles.brandMark}>
            <Ionicons name="mic" size={26} color="#FFFFFF" />
          </View>
          <AppText variant="display" align="center">
            Three quick permissions
          </AppText>
          <AppText variant="body" color="muted" align="center" style={styles.tagline}>
            Offload needs these to do its job. You can change any of them later.
          </AppText>
        </View>

        <View style={styles.card}>
          {ROWS.map((row, i) => {
            const granted = result?.[row.key] === true;
            const missing = result != null && !granted;
            return (
              <View
                key={row.key}
                style={[styles.row, i < ROWS.length - 1 && styles.rowDivider]}
              >
                <View
                  style={[
                    styles.rowIcon,
                    granted && styles.rowIconGranted,
                    missing && styles.rowIconMissing,
                  ]}
                >
                  <Ionicons
                    name={granted ? 'checkmark' : row.icon}
                    size={18}
                    color={
                      granted
                        ? colors.success
                        : missing
                        ? colors.warning
                        : colors.accent
                    }
                  />
                </View>
                <View style={styles.rowText}>
                  <AppText variant="heading">{row.title}</AppText>
                  <AppText variant="body" color="muted" style={styles.rowBody}>
                    {row.body}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>

        {declined.length > 0 ? (
          <View style={styles.notice}>
            <Ionicons name="alert-circle" size={17} color={colors.warning} />
            <AppText variant="secondary" color="muted" style={styles.noticeText}>
              {declined.length === ROWS.length
                ? 'Nothing was granted. Offload can still store notes, but recording and arrival reminders will not work.'
                : `${declined.map((d) => d.title).join(' and ')} ${
                    declined.length > 1 ? 'were' : 'was'
                  } declined. You can turn ${
                    declined.length > 1 ? 'them' : 'it'
                  } on in Settings whenever you like.`}
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          label={busy ? 'Waiting…' : 'Continue'}
          onPress={result ? finish : handleContinue}
          size="lg"
          disabled={busy}
          style={styles.cta}
        />
        {!result ? (
          <AppPressable
            onPress={handleSkip}
            style={styles.skip}
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
          >
            <AppText variant="secondary" color="muted">
              Not right now
            </AppText>
          </AppPressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: {
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.xxxl,
      paddingBottom: Spacing.xl,
    },
    brandBlock: { alignItems: 'center', marginBottom: Spacing.xxxl },
    brandMark: {
      width: 56,
      height: 56,
      borderRadius: Radius.lg,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xl,
    },
    tagline: { marginTop: Spacing.sm, paddingHorizontal: Spacing.md },
    card: {
      backgroundColor: c.bgSurface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', padding: Spacing.xl },
    rowDivider: { borderBottomWidth: 1, borderBottomColor: c.border },
    rowIcon: {
      width: 38,
      height: 38,
      borderRadius: Radius.sm,
      backgroundColor: c.accentLight,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Spacing.lg,
    },
    rowIconGranted: { backgroundColor: c.successBg },
    rowIconMissing: { backgroundColor: c.warningBg },
    rowText: { flex: 1 },
    rowBody: { marginTop: Spacing.xs },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      backgroundColor: c.warningBg,
      borderWidth: 1,
      borderColor: c.warningBorder,
      borderRadius: Radius.md,
      padding: Spacing.lg,
      marginTop: Spacing.xl,
    },
    noticeText: { flex: 1 },
    footer: {
      paddingHorizontal: Spacing.xxl,
      paddingTop: Spacing.lg,
      paddingBottom: Spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
    },
    cta: { width: '100%' },
    skip: { alignItems: 'center', paddingVertical: Spacing.lg },
  });

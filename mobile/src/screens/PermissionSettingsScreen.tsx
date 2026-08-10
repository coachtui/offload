/**
 * Settings → Location & permissions.
 *
 * A standing view of what Offload can access on this phone, plus a way to fix
 * anything that's off. Deliberately NOT the onboarding ladder: PermissionsScreen
 * is a one-shot flow that replaces itself with Home the moment everything is
 * granted, which made it useless as a settings destination — it flashed and
 * bounced straight back out.
 *
 * Unlike the ladder, this screen shows "Always" location, because that is the
 * permission that silently disables arrival reminders and the one users most
 * often need to come back and change.
 */

import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { usePermissionStatus } from '../hooks/usePermissionStatus';
import {
  PermissionSnapshot,
  canDeliverArrivalReminders,
  openSystemSettings,
  requestLocationAlways,
  requestMicrophone,
  requestNotifications,
} from '../services/permissionService';
import {
  AppButton,
  AppHeader,
  AppIconButton,
  AppScreen,
  AppText,
  ListRow,
  Radius,
  Spacing,
} from '../components/ui';
import { ThemeColors, useTheme, useThemedStyles } from '../theme';
import { haptic } from '../theme/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PermissionSettings'>;

/**
 * Why arrival reminders can't fire. Names every missing half rather than the
 * worst one — on a settings page, fixing one and still hearing nothing is worse
 * than being told up front that two things are off.
 */
function arrivalBlockerText(s: PermissionSnapshot): string {
  if (!s.locationAlways && !s.notifications) {
    return 'Offload needs "Always" location to notice when you arrive, and notifications to tell you.';
  }
  if (!s.locationAlways) {
    return s.locationWhenInUse
      ? 'Location is set to "While using". Offload can only notice arrivals when it\'s "Always".'
      : 'Offload needs "Always" location to notice when you arrive somewhere.';
  }
  return 'Notifications are off, so Offload has no way to reach you at a place.';
}

interface Row {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  /** Short state label shown on the right — "Always", "While using", "Off". */
  state: string;
  granted: boolean;
  /**
   * How to fix it, or null when there is nothing to fix. 'request' whenever the
   * OS will still show a dialog — iOS omits a permission row from an app's
   * Settings page until the app has asked for it once, so a deep link there
   * would land on a page without the control.
   */
  fix: { kind: 'request' | 'settings'; run: () => Promise<unknown> } | null;
}

function buildRows(s: PermissionSnapshot): Row[] {
  const micFix: Row['fix'] = s.microphone
    ? null
    : s.canAskMicrophoneAgain
    ? { kind: 'request', run: requestMicrophone }
    : { kind: 'settings', run: openSystemSettings };

  // Location is one row, not two: iOS presents it as a single three-state
  // choice, and splitting it into "when in use" and "always" reads as two
  // separate switches the user can't find in Settings.
  const locationFix: Row['fix'] = s.locationAlways
    ? null
    : s.canAskLocationAlwaysAgain
    ? { kind: 'request', run: requestLocationAlways }
    : { kind: 'settings', run: openSystemSettings };

  const notifFix: Row['fix'] = s.notifications
    ? null
    : s.canAskNotificationsAgain
    ? { kind: 'request', run: requestNotifications }
    : { kind: 'settings', run: openSystemSettings };

  return [
    {
      id: 'microphone',
      icon: 'mic',
      title: 'Microphone',
      subtitle: 'Talk a note out instead of typing.',
      state: s.microphone ? 'On' : 'Off',
      granted: s.microphone,
      fix: micFix,
    },
    {
      id: 'location',
      icon: 'location',
      title: 'Location',
      // ListRow clamps subtitles to two lines, so the "why Always matters"
      // explanation lives in the summary card above rather than here.
      subtitle: 'Match notes to nearby places, and notice arrivals.',
      state: s.locationAlways ? 'Always' : s.locationWhenInUse ? 'While using' : 'Off',
      granted: s.locationAlways,
      fix: locationFix,
    },
    {
      id: 'notifications',
      icon: 'notifications',
      title: 'Notifications',
      subtitle: 'How Offload reaches you at the right moment.',
      state: s.notifications ? 'On' : 'Off',
      granted: s.notifications,
      fix: notifFix,
    },
  ];
}

export default function PermissionSettingsScreen({ navigation }: { navigation: Nav }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Re-reads on every foreground, which is what makes the Settings round-trip
  // work: leave to flip a switch in iOS, come back, and this screen is correct.
  const { status, loading, refresh } = usePermissionStatus();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function runFix(row: Row) {
    if (busyId || !row.fix) return;
    haptic.tap();
    setBusyId(row.id);
    try {
      await row.fix.run();
    } finally {
      setBusyId(null);
      // Covers the in-app request path; the Settings path lands on the next
      // foreground, which usePermissionStatus already watches.
      await refresh();
    }
  }

  const rows = buildRows(status);
  const armed = canDeliverArrivalReminders(status);

  return (
    <AppScreen>
      <AppHeader
        title="Location & permissions"
        left={
          <AppIconButton
            icon="chevron-back"
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back"
          />
        }
      />

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.summary, armed ? styles.summaryOk : styles.summaryWarn]}>
            <Ionicons
              name={armed ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={armed ? colors.success : colors.warning}
            />
            <View style={styles.summaryText}>
              <AppText variant="heading">
                {armed ? 'Arrival reminders are on' : 'Arrival reminders are off'}
              </AppText>
              <AppText variant="secondary" color="muted" style={styles.summaryBody}>
                {armed
                  ? 'Offload can nudge you at the places you’ve saved.'
                  : arrivalBlockerText(status)}
              </AppText>
            </View>
          </View>

          <AppText variant="secondary" color="muted" style={styles.sectionTitle}>
            On this phone
          </AppText>

          {rows.map((row) => (
            <ListRow
              key={row.id}
              title={row.title}
              subtitle={row.subtitle}
              left={
                <View style={[styles.rowIcon, row.granted && styles.rowIconGranted]}>
                  <Ionicons
                    name={row.icon}
                    size={16}
                    color={row.granted ? colors.success : colors.warning}
                  />
                </View>
              }
              onPress={row.fix ? () => void runFix(row) : undefined}
              // The state label is always visible, never swapped out for the
              // action — otherwise "While using" and "Off" look identical, and
              // the half-granted case is exactly the one worth telling apart.
              meta={row.state}
              right={
                busyId === row.id ? (
                  <ActivityIndicator size="small" color={colors.textFaint} />
                ) : row.fix ? (
                  <View style={styles.action}>
                    <AppText variant="secondary" color="accent" style={styles.actionText}>
                      {row.fix.kind === 'request' ? 'Turn on' : 'Settings'}
                    </AppText>
                    <Ionicons
                      name={row.fix.kind === 'request' ? 'arrow-forward' : 'open-outline'}
                      size={14}
                      color={colors.accent}
                    />
                  </View>
                ) : null
              }
            />
          ))}

          <AppText variant="secondary" color="faint" style={styles.footnote}>
            Offload only reads your location to match notes to places and to notice when you arrive.
            It never shares where you are.
          </AppText>

          <AppButton
            label="Open iOS Settings"
            variant="secondary"
            onPress={() => {
              haptic.tap();
              void openSystemSettings();
            }}
            style={styles.settingsButton}
          />
        </ScrollView>
      )}
    </AppScreen>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { paddingBottom: Spacing.xxl },
    summary: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: Spacing.lg,
      marginHorizontal: Spacing.xxl,
      marginTop: Spacing.xl,
    },
    summaryOk: { backgroundColor: c.successBg, borderColor: c.successBorder },
    summaryWarn: { backgroundColor: c.warningBg, borderColor: c.warningBorder },
    summaryText: { flex: 1 },
    summaryBody: { marginTop: Spacing.xs },
    sectionTitle: {
      paddingHorizontal: Spacing.xxl,
      marginTop: Spacing.xxl,
      marginBottom: Spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      fontSize: 11,
    },
    rowIcon: {
      width: 30,
      height: 30,
      borderRadius: Radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.warningBg,
    },
    rowIconGranted: { backgroundColor: c.successBg },
    action: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    actionText: { fontSize: 13 },
    footnote: {
      paddingHorizontal: Spacing.xxl,
      marginTop: Spacing.xl,
      lineHeight: 18,
    },
    settingsButton: { marginTop: Spacing.xl, marginHorizontal: Spacing.xxl },
  });

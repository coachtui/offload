/**
 * Standing notice that a permission the app depends on is missing.
 *
 * This exists because the failure it reports is otherwise completely silent:
 * without "Always" location, syncMonitoring short-circuits, no region is ever
 * registered, and the user simply never hears from Offload again. A feature
 * that quietly does nothing reads as a broken app, not a withheld permission.
 *
 * Reports one thing at a time, worst first, so the home screen never turns into
 * a permission console.
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, AppPressable, Spacing, Radius } from './ui';
import { ThemeColors, useTheme, useThemedStyles } from '../theme';
import { haptic } from '../theme/haptics';
import {
  PermissionSnapshot,
  openSystemSettings,
  requestLocationAlways,
  requestNotifications,
} from '../services/permissionService';
import { syncGeofencesWithOS } from '../services/geofenceSync';

interface Props {
  status: PermissionSnapshot;
  loading: boolean;
  /** Re-read permissions after an in-app request so the banner clears itself. */
  onChanged: () => void;
}

interface Gap {
  id: string;
  title: string;
  body: string;
  /**
   * 'request' when the OS will still show a dialog — always preferred, because
   * Settings does not list a permission the app has never asked for.
   * 'settings' only once the OS has stopped asking.
   */
  action: 'request' | 'settings';
  run: () => Promise<void>;
}

/**
 * The single most consequential missing permission, or null when nothing is
 * wrong. Order matters: notifications outrank location because without them
 * even a perfectly armed geofence has no way to reach the user.
 */
function findGap(s: PermissionSnapshot): Gap | null {
  if (!s.notifications) {
    const canAsk = s.canAskNotificationsAgain;
    return {
      id: 'notifications',
      title: 'Notifications are off',
      body: 'Offload can save your notes, but it has no way to reach you when one becomes relevant.',
      action: canAsk ? 'request' : 'settings',
      run: canAsk
        ? async () => {
            await requestNotifications();
          }
        : openSystemSettings,
    };
  }

  if (!s.locationAlways) {
    const canAsk = s.canAskLocationAlwaysAgain;
    return {
      id: 'locationAlways',
      title: 'Arrival reminders are off',
      body: s.locationWhenInUse
        ? 'Location is set to “While Using”. Offload can’t nudge you at a place unless it’s “Always”.'
        : 'Offload needs location access to remind you when you arrive somewhere.',
      action: canAsk ? 'request' : 'settings',
      run: canAsk
        ? async () => {
            const granted = await requestLocationAlways();
            // Arm on the spot — geofences created while unpermissioned are
            // registered with nobody until something calls a sync.
            if (granted) await syncGeofencesWithOS('banner-granted');
          }
        : openSystemSettings,
    };
  }

  return null;
}

export function PermissionBanner({ status, loading, onChanged }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const gap = loading ? null : findGap(status);
  // Dismissal is scoped to the specific gap, so clearing one and later hitting a
  // different one still surfaces. It's per-session by design — the point is a
  // standing reminder, and usePermissionStatus re-checks on every foreground.
  if (!gap || gap.id === dismissedId) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="alert-circle" size={18} color={colors.warning} />
        <AppText variant="heading" style={styles.title}>
          {gap.title}
        </AppText>
        <AppPressable
          onPress={() => {
            haptic.tap();
            setDismissedId(gap.id);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Ionicons name="close" size={17} color={colors.textFaint} />
        </AppPressable>
      </View>

      <AppText variant="secondary" color="muted" style={styles.body}>
        {gap.body}
      </AppText>

      <AppPressable
        onPress={async () => {
          if (busy) return;
          haptic.tap();
          setBusy(true);
          try {
            await gap.run();
          } finally {
            setBusy(false);
            // Settings changes land on the next foreground, which
            // usePermissionStatus already watches; this covers the in-app path.
            onChanged();
          }
        }}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={gap.action === 'request' ? 'Turn on' : 'Open Settings'}
      >
        <AppText variant="secondary" color="accent" style={styles.actionText}>
          {gap.action === 'request' ? 'Turn on' : 'Open Settings'}
        </AppText>
        <Ionicons
          name={gap.action === 'request' ? 'arrow-forward' : 'open-outline'}
          size={14}
          color={colors.accent}
        />
      </AppPressable>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: c.warningBg,
      borderWidth: 1,
      borderColor: c.warningBorder,
      borderRadius: Radius.md,
      padding: Spacing.lg,
      marginHorizontal: Spacing.xxl,
      marginBottom: Spacing.lg,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    title: { flex: 1 },
    body: { marginTop: Spacing.sm },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: Spacing.xs,
      marginTop: Spacing.md,
    },
    actionText: { fontSize: 13 },
  });

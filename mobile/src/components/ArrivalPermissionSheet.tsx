/**
 * Stage 2 of the permission ladder — the "Always" location escalation.
 *
 * Fires the first time a recorded note actually produces a place, so the ask
 * arrives with its own justification attached ("you just saved something for
 * Safeway"). iOS shows this dialog exactly once; asking here rather than at
 * sign-up is the difference between a user who understands the trade and one
 * who is being interrogated by a brand-new app.
 *
 * Shown at most once per account — after that the Home banner is the standing
 * reminder, so a "maybe later" never turns into nagging.
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppSheet, AppText, AppButton, AppPressable, Spacing, Radius } from './ui';
import { ThemeColors, useTheme, useThemedStyles } from '../theme';
import { haptic } from '../theme/haptics';
import {
  requestLocationAlways,
  requestNotifications,
  getPermissionSnapshot,
  setArrivalPromptSeen,
} from '../services/permissionService';
import { syncGeofencesWithOS } from '../services/geofenceSync';

interface Props {
  visible: boolean;
  /** Name of the place that triggered this, e.g. "Safeway". */
  placeName?: string;
  onClose: () => void;
}

/**
 * These lines are a privacy claim shown at the moment of consent, so each one
 * has to survive being checked against what the code actually does.
 *
 * What "Always" buys, precisely: iOS region monitoring on the places you saved.
 * The crossing is detected by the OS on-device; Offload is woken only at the
 * boundary and never receives a location stream. That is the whole of what this
 * permission enables, and it is what these lines describe.
 *
 * What they deliberately do NOT claim is that Offload never handles location at
 * all — it does, elsewhere and under "When In Use": a recording carries its
 * coordinates so a place name can resolve nearby, and resolution queries
 * OpenStreetMap. Those are foreground, user-initiated, and out of scope here.
 * The previous copy ("your location is never stored or sent anywhere") claimed
 * otherwise and was false. Scope the claim; don't overstate it.
 *
 * Keep these terse. AppSheet caps at 85% of screen height and does NOT scroll,
 * so verbose assurances push the CTA off-screen on a 667pt device — the consent
 * button has to stay reachable. Three lines is the working budget.
 */
const ASSURANCES = [
  'Checked on your phone. When you arrive, Offload asks which notes are waiting there.',
  "No continuous tracking, and no history of where you've been.",
  'You can turn this off at any time in Settings.',
];

export function ArrivalPermissionSheet({ visible, placeName, onClose }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    await setArrivalPromptSeen();
    onClose();
  }

  async function handleEnable() {
    haptic.tap();
    setBusy(true);
    try {
      // Notifications first: "Always" location with no way to speak is a
      // permission spent for nothing.
      const snapshot = await getPermissionSnapshot();
      if (!snapshot.notifications) await requestNotifications();

      const granted = await requestLocationAlways();
      if (granted) {
        haptic.success();
        // Arm immediately — every geofence the backend created while we were
        // unpermissioned is currently registered with nobody.
        const count = await syncGeofencesWithOS('arrival-prompt-granted');
        console.log(`[ArrivalPermissionSheet] armed ${count} region(s)`);
      }
    } finally {
      setBusy(false);
      await dismiss();
    }
  }

  const title = placeName ? `Remind you at ${placeName}?` : 'Remind you when you arrive?';

  return (
    <AppSheet visible={visible} onClose={dismiss}>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={26} color={colors.accent} />
        </View>

        <AppText variant="title" align="center">
          {title}
        </AppText>

        <AppText variant="body" color="muted" align="center" style={styles.lede}>
          You just saved a note tied to a place. For Offload to nudge you when you
          get there, iOS needs location set to “Always”.
        </AppText>

        <View style={styles.assurances}>
          {ASSURANCES.map((line) => (
            <View key={line} style={styles.assuranceRow}>
              <Ionicons name="shield-checkmark" size={15} color={colors.success} />
              <AppText variant="secondary" color="muted" style={styles.assuranceText}>
                {line}
              </AppText>
            </View>
          ))}
        </View>

        <AppButton
          label={busy ? 'Waiting…' : 'Turn on arrival reminders'}
          onPress={handleEnable}
          size="lg"
          disabled={busy}
          style={styles.cta}
        />
        <AppPressable
          onPress={dismiss}
          style={styles.later}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
        >
          <AppText variant="secondary" color="muted">
            Maybe later
          </AppText>
        </AppPressable>
      </View>
    </AppSheet>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    body: { paddingTop: Spacing.sm, paddingBottom: Spacing.sm },
    iconWrap: {
      alignSelf: 'center',
      width: 54,
      height: 54,
      borderRadius: Radius.lg,
      backgroundColor: c.accentLight,
      borderWidth: 1,
      borderColor: c.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.xl,
    },
    lede: { marginTop: Spacing.md, paddingHorizontal: Spacing.sm },
    assurances: {
      backgroundColor: c.bgMuted,
      borderRadius: Radius.md,
      padding: Spacing.lg,
      marginTop: Spacing.xxl,
      gap: Spacing.md,
    },
    assuranceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
    assuranceText: { flex: 1 },
    cta: { width: '100%', marginTop: Spacing.xxl },
    later: { alignItems: 'center', paddingVertical: Spacing.lg },
  });

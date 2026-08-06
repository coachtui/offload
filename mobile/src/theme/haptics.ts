/**
 * Centralized haptic vocabulary. Use these instead of calling expo-haptics
 * directly so the app speaks one tactile language:
 *
 *  - tap:     light tick for primary taps (record FAB, chips, confirmations)
 *  - action:  medium impact for significant state changes (recording starts)
 *  - success: notification for completed saves
 *  - warning: notification for destructive confirmations appearing
 *
 * All fire-and-forget and safe to call anywhere (failures are swallowed —
 * e.g. simulators without haptic hardware).
 */
import * as Haptics from 'expo-haptics';

export const haptic = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  action: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

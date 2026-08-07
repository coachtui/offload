/**
 * Central permission state for Offload.
 *
 * Every OS permission the app depends on is checked and requested through here
 * so there is exactly one place that knows what "ready to work" means. Before
 * this existed, background location was requested from a single screen
 * (CreateGeofence) that most users never open — so arrival reminders, the whole
 * point of the product, silently never armed for anyone who just recorded notes.
 *
 * The permission ladder, in the order the app climbs it:
 *
 *   microphone          — required to record at all
 *   locationWhenInUse   — biases place resolution to the user's region; without
 *                         it a note saying "Safeway" geocodes against global
 *                         importance and can land a geofence on another continent
 *   notifications       — required to deliver anything
 *   locationAlways      — required for OS geofence monitoring; asked LAST, in
 *                         context, once the user has a real place to be reminded at
 */

import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import { ExpoPlayAudioStream } from '@mykin-ai/expo-audio-stream';

// ─── Persisted flags ──────────────────────────────────────────────────────────
// SecureStore rather than AsyncStorage only because it's already a dependency;
// nothing here is a secret.

const KEY_ONBOARDING_DONE = 'permissionOnboardingComplete';
const KEY_ARRIVAL_PROMPT_SEEN = 'arrivalPermissionPromptSeen';

export interface PermissionSnapshot {
  microphone: boolean;
  locationWhenInUse: boolean;
  locationAlways: boolean;
  notifications: boolean;
  // Whether the OS will still show a dialog. These matter more than they look:
  // iOS does not even list a permission row in an app's Settings page until the
  // app has requested it once, so telling a user to "open Settings" for a
  // permission that was never asked for sends them to a page where the control
  // does not exist. When these are true the fix is an in-app request, not a
  // deep link.
  canAskLocationAgain: boolean;
  canAskLocationAlwaysAgain: boolean;
  canAskNotificationsAgain: boolean;
}

export const EMPTY_SNAPSHOT: PermissionSnapshot = {
  microphone: false,
  locationWhenInUse: false,
  locationAlways: false,
  notifications: false,
  canAskLocationAgain: true,
  canAskLocationAlwaysAgain: true,
  canAskNotificationsAgain: true,
};

/**
 * True when the app can actually deliver an arrival reminder. Both halves are
 * load-bearing: "Always" location wakes the app, notifications let it speak.
 */
export function canDeliverArrivalReminders(s: PermissionSnapshot): boolean {
  return s.locationAlways && s.notifications;
}

// ─── Reading state ────────────────────────────────────────────────────────────

export async function getPermissionSnapshot(): Promise<PermissionSnapshot> {
  // Settled, not all — one probe throwing (e.g. a simulator without a mic)
  // must not blank out the other three and make the app look unpermissioned.
  const [mic, fg, bg, notif] = await Promise.allSettled([
    ExpoPlayAudioStream.getPermissionsAsync(),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    Notifications.getPermissionsAsync(),
  ]);

  const fgValue = fg.status === 'fulfilled' ? fg.value : null;
  const bgValue = bg.status === 'fulfilled' ? bg.value : null;
  const notifValue = notif.status === 'fulfilled' ? notif.value : null;

  return {
    microphone: mic.status === 'fulfilled' ? !!mic.value.granted : false,
    locationWhenInUse: fgValue?.granted ?? false,
    locationAlways: bgValue?.granted ?? false,
    notifications: notifValue?.status === 'granted',
    canAskLocationAgain: fgValue?.canAskAgain ?? true,
    // Escalating to Always requires foreground first, so the Always dialog is
    // only reachable while BOTH are still askable.
    canAskLocationAlwaysAgain: (bgValue?.canAskAgain ?? true) && (fgValue?.canAskAgain ?? true),
    canAskNotificationsAgain: notifValue?.canAskAgain ?? true,
  };
}

// ─── Requesting ───────────────────────────────────────────────────────────────
// Each returns the resulting grant state. None throw — a permission flow that
// crashes is worse than one that is declined.

export async function requestMicrophone(): Promise<boolean> {
  try {
    const { granted } = await ExpoPlayAudioStream.requestPermissionsAsync();
    console.log('[Permissions] microphone granted:', granted);
    return granted;
  } catch (err) {
    console.warn('[Permissions] microphone request failed:', err);
    return false;
  }
}

export async function requestLocationWhenInUse(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    console.log('[Permissions] location when-in-use:', status);
    return status === 'granted';
  } catch (err) {
    console.warn('[Permissions] foreground location request failed:', err);
    return false;
  }
}

export async function requestNotifications(): Promise<boolean> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    console.log('[Permissions] notifications:', status);
    return status === 'granted';
  } catch (err) {
    console.warn('[Permissions] notification request failed:', err);
    return false;
  }
}

/**
 * Escalate to "Always" location.
 *
 * iOS only shows this dialog once, and only when foreground is already granted —
 * so we request foreground first and bail rather than burning the one shot on a
 * call the OS would silently reject.
 */
export async function requestLocationAlways(): Promise<boolean> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[Permissions] foreground denied — cannot escalate to Always');
        return false;
      }
    }

    const { status } = await Location.requestBackgroundPermissionsAsync();
    console.log('[Permissions] location always:', status);
    return status === 'granted';
  } catch (err) {
    console.warn('[Permissions] background location request failed:', err);
    return false;
  }
}

/**
 * Stage 1 of the onboarding ladder: everything except "Always" location.
 *
 * Sequential, not parallel — iOS queues permission dialogs and firing them
 * concurrently makes the second one land before the first is dismissed.
 */
export async function requestFoundationalPermissions(): Promise<PermissionSnapshot> {
  await requestMicrophone();
  await requestLocationWhenInUse();
  await requestNotifications();
  return getPermissionSnapshot();
}

// ─── Settings deep link ───────────────────────────────────────────────────────

/**
 * Open this app's page in system Settings. The only recovery path once a
 * permission has been permanently declined.
 */
export async function openSystemSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch (err) {
    console.warn('[Permissions] could not open settings:', err);
  }
}

// ─── Onboarding flags ─────────────────────────────────────────────────────────

async function readFlag(key: string): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(key)) === 'true';
  } catch {
    return false;
  }
}

async function writeFlag(key: string, value: boolean): Promise<void> {
  try {
    if (value) await SecureStore.setItemAsync(key, 'true');
    else await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn(`[Permissions] could not persist ${key}:`, err);
  }
}

export const hasCompletedPermissionOnboarding = () => readFlag(KEY_ONBOARDING_DONE);
export const setPermissionOnboardingComplete = () => writeFlag(KEY_ONBOARDING_DONE, true);

export const hasSeenArrivalPrompt = () => readFlag(KEY_ARRIVAL_PROMPT_SEEN);
export const setArrivalPromptSeen = () => writeFlag(KEY_ARRIVAL_PROMPT_SEEN, true);

/**
 * Clear onboarding state on sign-out so the next account onboards from scratch
 * rather than inheriting the previous user's "already asked" flags.
 */
export async function resetPermissionOnboarding(): Promise<void> {
  await writeFlag(KEY_ONBOARDING_DONE, false);
  await writeFlag(KEY_ARRIVAL_PROMPT_SEEN, false);
}

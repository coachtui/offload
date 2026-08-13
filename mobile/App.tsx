import { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { AuthProvider } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { ThemeProvider, fontMap } from './src/theme';
import { syncGeofencesWithOS } from './src/services/geofenceSync';
import { syncTimeRemindersWithOS } from './src/services/timeReminderSync';
import { registerBackgroundNotificationSync } from './src/services/backgroundNotificationSync';
import { emitArrivalPromptCandidate } from './src/services/arrivalPromptBus';
import { emitNotesChanged } from './src/services/notesBus';
import { ToastProvider } from './src/components/ui';

async function checkForUpdate() {
  if (!Updates.isEnabled) {
    console.log('[Updates] Updates not enabled in this build — skipping');
    return;
  }
  try {
    console.log('[Updates] Checking for update...');
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      console.log('[Updates] Update available — downloading...');
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } else {
      console.log('[Updates] Already up to date');
    }
  } catch (err) {
    console.warn('[Updates] Check failed:', err);
  }
}

// Refresh the arrival snapshot whenever the app comes to the foreground, at
// most once per this window. The snapshot is what a locked-phone arrival fires
// from, so every foreground session is a chance to correct it in both
// directions — a note added from another device, or one resolved since the
// last sync (stale-high snapshots are what produce pings about finished notes).
const APP_ACTIVE_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastAppActiveSyncAt = 0;

function syncOnAppActive(): void {
  const now = Date.now();
  if (now - lastAppActiveSyncAt < APP_ACTIVE_SYNC_MIN_INTERVAL_MS) return;
  lastAppActiveSyncAt = now;
  syncGeofencesWithOS('app-active').catch((err) =>
    console.warn('[App] app-active geofence sync failed:', err)
  );
  // Same idea for dated reminders: this is where a reminder created on another
  // device gets scheduled locally, and one resolved elsewhere gets cancelled.
  syncTimeRemindersWithOS('app-active').catch((err) =>
    console.warn('[App] app-active reminder sync failed:', err)
  );
}

function handleNotificationData(data: any, attempt = 0) {
  // On cold start the navigation tree may not be mounted yet when the tapped
  // notification resolves. Retry briefly (max ~3s) until the ref is ready,
  // otherwise the deep-link is silently dropped and the app lands on the
  // default screen instead of the place summary.
  if (!navigationRef.isReady()) {
    if (attempt < 20) setTimeout(() => handleNotificationData(data, attempt + 1), 150);
    return;
  }

  if (data?.screen === 'PlaceSummary' && (data?.placeId || data?.geofenceId)) {
    console.log('[App] Navigating to PlaceSummary:', data.placeId || data.geofenceId);
    navigationRef.navigate('PlaceSummary', {
      placeId: data.placeId,
      geofenceId: data.geofenceId,
      placeName: data.placeName || data.geofenceName || 'This place',
      eventType: data.eventType === 'exit' ? 'exit' : 'enter',
    });
  } else if (data?.screen === 'Objects' && data?.geofenceId) {
    console.log('[App] Navigating to Objects with geofenceId:', data.geofenceId);
    navigationRef.navigate('Objects', { geofenceId: data.geofenceId });
  } else if (data?.screen === 'Objects' && data?.objectId) {
    console.log('[App] Navigating to Objects with objectId:', data.objectId);
    navigationRef.navigate('Objects', { objectId: data.objectId });
  } else if (data?.screen === 'Objects' && data?.sessionId) {
    // A recording that sorted into several notes — open the list scoped to it
    // rather than guessing which of them the tap meant.
    console.log('[App] Navigating to Objects for session:', data.sessionId);
    navigationRef.navigate('Objects', { sessionId: data.sessionId });
  } else if (data?.screen === 'Insights') {
    navigationRef.navigate('Insights');
  }
}

/**
 * Act on a "your note finished sorting" push.
 *
 * Sorting moved server-side, so the place names a note mentioned are no longer
 * known when the save returns — they arrive here instead. Runs on *receipt*,
 * not on tap: a geofence the user never armed because they didn't open the
 * notification is a reminder that silently never fires.
 */
const processedSessions = new Set<string>();

function handleSessionProcessed(data: any): void {
  // arrivalArmed is the honest signal: names a reminder actually exists for.
  // Older server payloads carry only hasGeofenceCandidates ("we tried"), so
  // fall back to the old reading when the new field is absent. A note whose
  // places merely queued as pending lookups arms nothing — no sync, and no
  // Always-permission escalation for a reminder that doesn't exist.
  const armed: string[] = Array.isArray(data?.arrivalArmed)
    ? data.arrivalArmed
    : data?.hasGeofenceCandidates && Array.isArray(data?.placeNames)
      ? data.placeNames
      : [];
  if (armed.length === 0) return;

  // Reachable twice for one note: once on receipt, again if the user then taps
  // it. Both paths are needed — receipt is missed when the app is killed, taps
  // are missed when it is not — so the guard lives here rather than at either
  // call site. Bounded by notes-with-places per app run.
  const sessionId: string | undefined = data.sessionId;
  if (sessionId) {
    if (processedSessions.has(sessionId)) return;
    processedSessions.add(sessionId);
  }

  console.log('[App] Session processed with armed places:', armed);

  // Resolution is finished by the time this push sends, but the region write
  // and the push race — a short grace keeps the sync from asking too early.
  setTimeout(() => {
    syncGeofencesWithOS('session-processed').catch((err) =>
      console.warn('[App] geofence re-sync after processing failed:', err)
    );
  }, 6000);

  emitArrivalPromptCandidate(armed);
}

export default function App() {
  const [fontsLoaded] = useFonts(fontMap);

  useEffect(() => {
    if (!__DEV__) checkForUpdate();

    // Arms new geofences from a silent push when the app is killed. Guarded —
    // a no-op on builds without the remote-notification background mode.
    registerBackgroundNotificationSync();

    syncOnAppActive();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncOnAppActive();
    });

    // Handle notification taps while app is running or backgrounded
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      console.log('[App] Notification tapped:', data);
      if (data?.sessionId) emitNotesChanged('sorted');
      handleSessionProcessed(data);
      handleNotificationData(data);
    });

    // Arrival of the "note sorted" push, tapped or not. The geofence work it
    // carries must not wait on the user opening the notification.
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as any;
      if (data?.sessionId) {
        console.log('[App] Session-processed push received:', data.sessionId);
        // The notes this recording became now exist server-side — this is the
        // earliest honest moment to refresh whatever list is on screen.
        emitNotesChanged('sorted');
        handleSessionProcessed(data);
      }
    });

    // Handle cold-start via notification tap. handleSessionProcessed must run
    // here too: tapping a "note sorted" push from a killed app is one of the
    // few chances a brand-new place's geofence gets to register, and this path
    // used to skip it (only navigating). The processedSessions guard makes the
    // duplicate call harmless when the warm-start listener already handled it.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as any;
      console.log('[App] Cold start with notification:', data);
      handleSessionProcessed(data);
      handleNotificationData(data);
    });

    return () => {
      appStateSubscription.remove();
      subscription.remove();
      receivedSubscription.remove();
    };
  }, []);

  // Keep the splash visible until Inter is ready so text never flashes
  // from the system face to the brand face.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="auto" />
            <AppNavigator />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

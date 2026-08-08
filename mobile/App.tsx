import { useEffect } from 'react';
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
import { emitArrivalPromptCandidate } from './src/services/arrivalPromptBus';
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
  if (!data?.hasGeofenceCandidates) return;

  // Reachable twice for one note: once on receipt, again if the user then taps
  // it. Both paths are needed — receipt is missed when the app is killed, taps
  // are missed when it is not — so the guard lives here rather than at either
  // call site. Bounded by notes-with-places per app run.
  const sessionId: string | undefined = data.sessionId;
  if (sessionId) {
    if (processedSessions.has(sessionId)) return;
    processedSessions.add(sessionId);
  }

  const placeNames: string[] = Array.isArray(data.placeNames) ? data.placeNames : [];
  console.log('[App] Session processed with place candidates:', placeNames);

  // Server-side place resolution is fire-and-forget and may still be in flight
  // when this push lands, so give it a moment before asking for the geofences.
  setTimeout(() => {
    syncGeofencesWithOS('session-processed').catch((err) =>
      console.warn('[App] geofence re-sync after processing failed:', err)
    );
  }, 6000);

  emitArrivalPromptCandidate(placeNames);
}

export default function App() {
  const [fontsLoaded] = useFonts(fontMap);

  useEffect(() => {
    if (!__DEV__) checkForUpdate();

    // Handle notification taps while app is running or backgrounded
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      console.log('[App] Notification tapped:', data);
      handleSessionProcessed(data);
      handleNotificationData(data);
    });

    // Arrival of the "note sorted" push, tapped or not. The geofence work it
    // carries must not wait on the user opening the notification.
    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as any;
      if (data?.sessionId) {
        console.log('[App] Session-processed push received:', data.sessionId);
        handleSessionProcessed(data);
      }
    });

    // Handle cold-start via notification tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as any;
      console.log('[App] Cold start with notification:', data);
      handleNotificationData(data);
    });

    return () => {
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

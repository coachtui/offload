import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { AuthProvider } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';

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
  }
}

export default function App() {
  useEffect(() => {
    if (!__DEV__) checkForUpdate();

    // Handle notification taps while app is running or backgrounded
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      console.log('[App] Notification tapped:', data);
      handleNotificationData(data);
    });

    // Handle cold-start via notification tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as any;
      console.log('[App] Cold start with notification:', data);
      handleNotificationData(data);
    });

    return () => subscription.remove();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <AppNavigator />
    </AuthProvider>
  );
}

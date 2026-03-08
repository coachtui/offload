import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { AuthProvider } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';

async function checkForUpdate() {
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {
    // Non-fatal — continue with current bundle
  }
}

function handleNotificationData(data: any) {
  if (!navigationRef.isReady()) return;

  if (data?.screen === 'PlaceSummary' && data?.placeId) {
    console.log('[App] Navigating to PlaceSummary:', data.placeId);
    navigationRef.navigate('PlaceSummary', {
      placeId: data.placeId,
      placeName: data.placeName || 'This place',
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

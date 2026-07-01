import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiService } from './api';

const EAS_PROJECT_ID = '6444b92a-4608-4106-8a94-5764a457cb72';

/**
 * Request push permission (if not already granted), obtain an Expo push token,
 * and register it with the backend. Never throws — all errors are swallowed so
 * a push-registration failure never breaks the auth flow.
 */
export async function registerPushTokenWithBackend(): Promise<void> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[pushRegistration] push permission not granted — skipping registration');
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    const token = tokenData.data;
    const platform: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios';

    console.log('[pushRegistration] registering push token with backend, platform:', platform);
    await apiService.registerPushToken(token, platform);
    console.log('[pushRegistration] push token registered successfully');
  } catch (error) {
    console.error('[pushRegistration] failed to register push token:', error);
  }
}

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { auth } from '../api/endpoints.js';

/**
 * Phone alerts for the store owner: new orders, UPI references, cancellations, low stock,
 * team updates. The server pushes; this file only asks permission, sets up the Android
 * channel and tells the backend where to send. Tapping an alert opens its screen (see
 * usePushNavigation in app/_layout.jsx).
 */

// Show alerts while the app is open too, so a new order is never missed on screen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Never throws: no permission, emulator or offline just means no push for now. */
export async function registerForPush() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('store_updates', {
        name: 'Orders & store updates',
        description: 'New orders, payments, cancellations and stock alerts',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await auth.registerPushToken({ token, platform: Platform.OS });
    return true;
  } catch {
    return false;
  }
}

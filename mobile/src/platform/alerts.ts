// Alerts on the lock screen. Your computer sends them (main/phone-alerts.mjs)
// to the token this phone leaves online (lib/push-device.ts); a test alert
// is sent from the phone itself, which proves the road from Expo's push
// service to the lock screen.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }),
});

export const alertsHere = Platform.OS !== 'web';

export async function alertToken(): Promise<string> {
  if (!Device.isDevice) throw new Error('Alerts need the app on a phone.');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Threads', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') throw new Error('Alerts are off for this app in Settings.');
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('This build has no Expo project, so it cannot get alerts.');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

/** The token while alerts are still allowed, without asking; null once they were turned off in Settings. */
export async function alertTokenIfAllowed(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if ((await Notifications.getPermissionsAsync()).status !== 'granted') return null;
  return alertToken();
}

export function setIconCount(n: number) {
  if (Platform.OS === 'web') return;
  Notifications.setBadgeCountAsync(n).catch(() => { /* the icon keeps its last count */ });
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function sendTestAlert(token: string, request: Fetch) {
  const res = await request('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ to: token, title: 'Agentbox', body: 'A test alert. Threads that need you will arrive like this.', sound: 'default' }),
  });
  const said = await res.json().catch(() => null);
  if (!res.ok || said?.data?.status === 'error') throw new Error(said?.data?.message ?? 'Expo did not send the alert.');
}

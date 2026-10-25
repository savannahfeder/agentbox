// This phone's alert address, left in push_devices for your own computers to
// send to (main/phone-alerts.mjs), and taken back when alerts go off.
import type { CloudClient } from '../../../renderer/src/cloud-rest';

export const ALERTS_KEY = 'agentbox-alerts';
export const EXPO_TOKEN = /^ExponentPushToken\[[A-Za-z0-9_-]{10,200}\]$/;
export type KeptAlerts = { token: string; at: number } | null;

export function readAlerts(raw: string | null | undefined): KeptAlerts {
  try {
    const v = JSON.parse(raw ?? 'null');
    return v && typeof v.token === 'string' && EXPO_TOKEN.test(v.token) && Number.isFinite(v.at) ? { token: v.token, at: v.at } : null;
  } catch { return null; }
}

type Rest = Pick<CloudClient, 'upsert' | 'remove'>;

export async function leaveAddress(c: Rest, { token, platform, appVersion, now }: { token: string; platform: string; appVersion: string | null; now: number }) {
  if (!EXPO_TOKEN.test(token)) throw new Error('Expo did not give this phone an address for alerts.');
  if (platform !== 'ios' && platform !== 'android') throw new Error('Alerts need the app on a phone.');
  await c.upsert('push_devices', { token, platform, app_version: appVersion ? appVersion.slice(0, 40) : null, updated_at: new Date(now).toISOString() }, 'owner,token');
}

export async function takeAddressBack(c: Rest, token: string) {
  await c.remove('push_devices', `token=eq.${encodeURIComponent(token)}`);
}

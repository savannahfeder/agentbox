// ALERTS FOR THE WEB APP ON A PHONE. The web app subscribes to Web Push with a
// signing key pair of its own and hands the subscription and the keys to each
// computer as a setting (renderer/src/cloud-alerts.ts); each computer sends its
// alerts to it beside the phone app's (main/phone-alerts.mts). No server of
// ours signs or sends, so none needs the keys.

export const WEB_ALERTS_KEY = 'webAlerts';
export const WEB_ALERTS_TEST_KEY = 'webAlertsTest';

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** A phone's web app with alerts on, as its setting carries it. */
export interface WebAlertsOn {
  on: true;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  vapid: VapidKeys;
}

/** A setting command the web app left for its computers. */
export interface WebAlertsCommand {
  payload?: { key?: unknown; value?: unknown } | null;
  created_at?: string;
}

interface AlertsShape {
  endpoint?: unknown;
  on?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  vapid?: { publicKey?: unknown; privateKey?: unknown };
}

// Decoded length of an unpadded base64url string, or -1.
const bytes = (s: unknown): number => (typeof s === 'string' && /^[A-Za-z0-9_-]{2,200}$/.test(s) ? Math.floor((s.length * 6) / 8) : -1);

export const endpointOk = (e: unknown): boolean => typeof e === 'string' && e.length <= 1000 && /^https:\/\/[^\s/]+\/\S*$/.test(e);

/** `{ on: true, endpoint, keys: { p256dh, auth }, vapid: { publicKey, privateKey } }`, or `{ on: false, endpoint }`. */
export function webAlertsOk(value: unknown): value is { on: boolean; endpoint: string } {
  const v = value as AlertsShape | null | undefined;
  if (!v || typeof v !== 'object' || !endpointOk(v.endpoint)) return false;
  if (v.on === false) return true;
  return v.on === true
    && bytes(v.keys?.p256dh) === 65 && bytes(v.keys?.auth) >= 16
    && bytes(v.vapid?.publicKey) === 65 && bytes(v.vapid?.privateKey) === 32;
}

export const webAlertsTestOk = (v: unknown): boolean => !!v && typeof v === 'object' && endpointOk((v as AlertsShape).endpoint);

/**
 * The phones with alerts on, from the setting commands the web app left for
 * its computers (`{ payload, created_at }`): the latest for each phone decides,
 * whichever computer it was left for. The cloud reads them with every computer off.
 */
export function webAlertsOn(commands: readonly (WebAlertsCommand | null | undefined)[]): WebAlertsOn[] {
  const latest = new Map<string, { on: boolean; endpoint: string }>();
  const inOrder = [...commands].sort((a, b) => String(a?.created_at).localeCompare(String(b?.created_at)));
  for (const c of inOrder) {
    const v = c?.payload?.key === WEB_ALERTS_KEY ? c.payload.value : null;
    if (webAlertsOk(v)) latest.set(v.endpoint, v);
  }
  return [...latest.values()].filter((v): v is WebAlertsOn => v.on === true);
}

const toB64url = (data: Uint8Array): string => {
  let s = '';
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** A P-256 pair as Web Push signs with it: the public point raw, the private scalar. */
export async function makeVapidKeys(subtle: typeof globalThis.crypto.subtle): Promise<VapidKeys> {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const jwk = await subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: toB64url(raw), privateKey: jwk.d as string };
}

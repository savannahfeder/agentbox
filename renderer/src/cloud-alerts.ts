// ALERTS ON THE WEB APP: its own Web Push subscription and signing keys,
// handed to every computer of the account as a setting (shared/web-alerts.mjs).
// Each computer sends its alerts to it (main/phone-alerts.mjs).

import { makeVapidKeys, WEB_ALERTS_KEY, WEB_ALERTS_TEST_KEY } from '../../shared/web-alerts.mjs';
import { settingCommand } from './phone-rows';
import type { AlertsVia } from './phone-alerts';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Kept = { vapid?: { publicKey: string; privateKey: string }; endpoint?: string; keys?: { p256dh: string; auth: string }; sentTo?: string[] };
const KEPT = 'agentbox-web-alerts';

export function cloudAlertsVia({ computers, send, storage, subtle }: {
  /** This account's computers, the most recently seen first. */
  computers: () => string[];
  send: (cmd: ReturnType<typeof settingCommand>) => Promise<unknown>;
  storage: Store;
  subtle: SubtleCrypto;
}): AlertsVia & { catchUp(): Promise<void> } {
  const read = (): Kept => { try { return JSON.parse(storage.getItem(KEPT) || '{}') || {}; } catch { return {}; } };
  const write = (k: Kept) => { try { storage.setItem(KEPT, JSON.stringify(k)); } catch { /* private mode: this visit only */ } };
  const on = (k: Kept) => ({ on: true, endpoint: k.endpoint, keys: k.keys, vapid: k.vapid });
  const tell = (device: string, value: unknown) => send(settingCommand(device, { scope: 'workspace', key: WEB_ALERTS_KEY, value }));

  return {
    async on() { return !!read().endpoint; },
    async key() {
      const k = read();
      const vapid = k.vapid ?? await makeVapidKeys(subtle);
      if (!k.vapid) write({ ...k, vapid });
      return vapid.publicKey;
    },
    async subscribe(sub) {
      const all = computers();
      if (!all.length) throw new Error('No computer is connected yet. Connect one, then turn alerts on.');
      const k = { ...read(), endpoint: sub.endpoint, keys: sub.keys };
      for (const device of all) await tell(device, on(k));
      write({ ...k, sentTo: all });
    },
    async unsubscribe() {
      const k = read();
      if (k.endpoint) for (const device of computers()) await tell(device, { on: false, endpoint: k.endpoint });
      write({ vapid: k.vapid });
    },
    async test() {
      const k = read();
      const newest = computers()[0];
      if (!k.endpoint || !newest) return false;
      await send(settingCommand(newest, { scope: 'workspace', key: WEB_ALERTS_TEST_KEY, value: { endpoint: k.endpoint } }));
      return true;
    },
    // A computer connected after alerts were turned on gets them too.
    async catchUp() {
      const k = read();
      if (!k.endpoint) return;
      const missing = computers().filter((d) => !(k.sentTo ?? []).includes(d));
      if (!missing.length) return;
      for (const device of missing) await tell(device, on(k));
      write({ ...k, sentTo: [...(k.sentTo ?? []), ...missing] });
    },
  };
}

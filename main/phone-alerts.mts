// ALERTS ON HER PHONE'S LOCK SCREEN, SENT BY THIS MAC.
//
// The arrivals are the desktop banner's (main/notify.mts, from App.tsx's
// inbox), and so are the rules (shared/notify-rules.mts): nothing while she
// has used this Mac in the last five minutes, once per stretch away, once
// more for a permission card. They go out from the phone pass, after it has
// published, so the thread an alert opens is already on the phone. The
// server-side sender in docs/mobile/PLAN.md, which alerts with every Mac
// shut, is a later phase.
//
// The words are the phone banner's (phoneBanner): the thread's title in bold,
// asked for on 2026-10-13 and again on 2026-10-23, and nothing else of it.
import webpush from 'web-push';
import { atTheComputer, shouldSpeak, phoneBanner } from '../shared/notify-rules.mts';
import { WEB_ALERTS_KEY, WEB_ALERTS_TEST_KEY } from '../shared/web-alerts.mts';
import { Name } from '../shared/product-name.mjs';

/** A web app's push subscription, with the keys it made (shared/web-alerts.mts). */
export interface WebAlertSub {
  endpoint: string;
  keys?: unknown;
  vapid: { publicKey: string; privateKey: string };
  at?: number;
}

export type WebPushSend = (sub: { endpoint: string; keys?: unknown }, body: string, opts: Record<string, unknown>) => Promise<unknown>;

/** One alert to one phone, as Expo's push service takes it. */
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: string;
  badge: number;
  priority: string;
  channelId: string;
  data: { product?: string; id?: string };
}

/** Expo's answer for one message. */
export interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

export type ExpoSend = (messages: ExpoMessage[]) => Promise<ExpoTicket[] | null | undefined>;

/** What the alerts keep in the phone pass's state file. */
export interface AlertsState {
  alerted: Record<string, { stamp: string; at: number }>;
  webAlerts: Record<string, WebAlertSub>;
}

/** What the desktop's notifier was told arrived: a thread, or a permission card on one. Unchecked until `arrived` reads it. */
interface ArrivalSeen {
  id?: unknown;
  product?: unknown;
  kind?: unknown;
  item?: unknown;
  title?: unknown;
  thread?: unknown;
}

/** A web app's alerts setting, as shared/web-alerts.mts `webAlertsOk` and `webAlertsTestOk` let it through. */
export type AlertsChange =
  | { key: typeof WEB_ALERTS_TEST_KEY; value: { endpoint: string; on?: undefined } }
  | { key: typeof WEB_ALERTS_KEY; value: { on: true; endpoint: string; keys: unknown; vapid: WebAlertSub['vapid'] } | { on: false; endpoint: string } };

/** What web-push and fetch throw, as far as it is read here. */
type PushError = { statusCode?: number; message?: string } | null;

interface Queued {
  ask: boolean;
  product: string;
  item: string;
  title: unknown;
  thread: unknown;
}

/** A thread's row as the phone has it. */
export interface CarriedRow {
  title?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  wrote?: { status?: { ts?: unknown } | null } | null;
}

export interface PhoneAlertsOptions {
  /** Made only for a backend that has phones to alert (main/phone-inbox.mts). */
  backend: {
    pushDevices?(owner: string): Promise<{ token: string }[]>;
    dropPushDevice?(token: string, owner: string): Promise<unknown>;
  };
  owner: string;
  device: string;
  state: AlertsState;
  save: () => void;
  now: () => number;
  log: (line: string) => void;
  idleMs: () => number;
  send?: ExpoSend;
  sendWebPush?: WebPushSend;
  still?: () => void;
}

export const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
// Who signs a Web Push, as the push services ask: the product, never a person.
const PUSH_SUBJECT = 'https://agentbox.ac';
export const webPushOf: WebPushSend = (sub, body, opts) => webpush.sendNotification(sub, body, opts);
// Arrivals this close together are one alert.
export const FOLD_MS = 3000;
const DEADLINE_MS = 10_000;
export const TEST_ALERT = { title: Name, body: 'Alerts reach this phone.' };

/** One alert to the web app on a phone, signed with the keys it made (shared/web-alerts.mts), from a computer or the cloud. */
export const sendWebAlert = (web: WebAlertSub, payload: Record<string, unknown>, send: WebPushSend = webPushOf): Promise<unknown> => send(
  { endpoint: web.endpoint, keys: web.keys },
  JSON.stringify({ tag: 'agentbox', ...payload }),
  { vapidDetails: { subject: PUSH_SUBJECT, publicKey: web.vapid.publicKey, privateKey: web.vapid.privateKey }, TTL: 6 * 3600, urgency: 'high', timeout: DEADLINE_MS },
);
const ALERTED_KEPT_MS = 30 * 24 * 3600_000;

// renderer/src/phone-rows.ts phoneSlug, which the phone opens a thread by.
const phoneSlugOf = (device: string, project: string) => `${project}@${device}`;
const stampOf = (item: CarriedRow) => `${item.status ?? ''}:${item.wrote?.status?.ts ?? item.updatedAt ?? ''}`;

/** One request for every phone; Expo answers a ticket for each, in order. */
export async function sendToExpo(messages: ExpoMessage[], { fetchImpl = fetch, url = EXPO_PUSH, deadlineMs = DEADLINE_MS }: { fetchImpl?: typeof fetch; url?: string; deadlineMs?: number } = {}): Promise<ExpoTicket[]> {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(messages), signal: AbortSignal.timeout(deadlineMs) });
  const said = await res.json().catch(() => null) as { data?: ExpoTicket[]; errors?: { message?: string }[] } | null;
  if (!res.ok || !Array.isArray(said?.data)) throw new Error(`Expo answered ${res.status}${said?.errors?.[0]?.message ? `: ${said.errors[0].message}` : ''}`);
  return said.data;
}

export function createPhoneAlerts({ backend, owner, device, state, save, now, log, idleMs, send = sendToExpo, sendWebPush = webPushOf, still = () => {} }: PhoneAlertsOptions) {
  state.alerted ??= {};
  // The web app's subscriptions, by endpoint (shared/web-alerts.mts).
  state.webAlerts ??= {};
  // In memory, as the desktop's banner keeps them: an arrival is news once.
  const queued = new Map<string, Queued>();
  let firstAt = 0;
  let needsYou: { id: string; product: string }[] = [];
  let spoke = false;
  let spokeAsk = false;
  const said = new Set<string>();
  const once = (kind: string, line: string) => { if (!said.has(kind)) log(line); said.add(kind); };
  const away = () => { try { return !atTheComputer({ idleMs: idleMs() }); } catch { return true; } };

  function seen() {
    queued.clear();
    spoke = false;
    spokeAsk = false;
  }

  /** One alert to one web app; false when its push service has forgotten it, which forgets it here. */
  async function pushWeb(web: WebAlertSub, payload: Record<string, unknown>): Promise<boolean> {
    try {
      await sendWebAlert(web, payload, sendWebPush);
      return true;
    } catch (err) {
      if ((err as PushError)?.statusCode === 404 || (err as PushError)?.statusCode === 410) {
        delete state.webAlerts[web.endpoint];
        save();
      } else once(`web:${(err as PushError)?.statusCode ?? (err as PushError)?.message}`, `phone: could not send an alert to the web app: ${(err as PushError)?.message ?? err}`);
      return false;
    }
  }

  const takesSetting = (p: Record<string, unknown> | null | undefined): boolean => p?.key === WEB_ALERTS_KEY || p?.key === WEB_ALERTS_TEST_KEY;
  /** The web app turning its alerts on or off, or asking for a test. */
  async function setting(p: AlertsChange): Promise<{ ok: true }> {
    const v = p.value;
    if (p.key === WEB_ALERTS_TEST_KEY) {
      const web = state.webAlerts[v.endpoint];
      if (!web) throw new Error('alerts are not on for this phone on this computer');
      if (!(await pushWeb(web, TEST_ALERT))) throw new Error('the phone\'s push service did not take the alert');
      return { ok: true };
    }
    if (v.on) state.webAlerts[v.endpoint] = { endpoint: v.endpoint, keys: v.keys, vapid: v.vapid, at: now() };
    else delete state.webAlerts[v.endpoint];
    save();
    return { ok: true };
  }

  /** What the desktop's notifier was told arrived, and the inbox it arrived in. */
  function arrived(list: unknown, inbox: unknown = []): void {
    if (!Array.isArray(list) || !list.length) return;
    if (!away()) return seen();
    if (Array.isArray(inbox)) needsYou = (inbox as (ArrivalSeen | null)[]).filter((r) => r && typeof r.id === 'string' && typeof r.product === 'string') as { id: string; product: string }[];
    for (const a of list as (ArrivalSeen | null)[]) {
      if (!a || typeof a.id !== 'string' || typeof a.product !== 'string') continue;
      const ask = a.kind === 'approval';
      const item = ask ? a.item : a.id;
      if (typeof item !== 'string') continue;
      if (!queued.size) firstAt = now();
      queued.set(ask ? `ask:${a.id}` : `${a.product}:${a.id}`, { ask, product: a.product, item, title: a.title, thread: a.thread });
    }
  }

  // `carried(slug, id)` is the thread's row when the phone has it, else null.
  async function pass(carried: (slug: string, id: string) => CarriedRow | null): Promise<void> {
    if (!away()) return seen();
    if (!queued.size || now() - firstAt < FOLD_MS) return;
    const fresh: (Queued & { key: string; stamp: string; named: unknown })[] = [];
    for (const [key, q] of queued) {
      const row = carried(q.product, q.item);
      if (!row) continue;
      const stamp = q.ask ? 'asked' : stampOf(row);
      if (state.alerted[key]?.stamp !== stamp) fresh.push({ key, stamp, ...q, named: row.title });
    }
    queued.clear();
    if (!fresh.length || !shouldSpeak({ spoke, spokeAsk, waiting: fresh.map((f) => ({ kind: f.ask ? 'approval' : 'item' })) })) return;
    still();
    let phones: { token: string }[] = [];
    try { phones = await backend.pushDevices!(owner); } catch (err) { once('read', `phone: could not read the phones to alert: ${(err as PushError)?.message ?? err}`); }
    const webs = Object.values(state.webAlerts);
    if (!phones.length && !webs.length) return;
    const threads = [...new Set(fresh.map((f) => `${f.product}\0${f.item}`))];
    const [product, item] = threads[0].split('\0');
    const badge = new Set(needsYou.filter((r) => carried(r.product, r.id)).map((r) => `${r.product}\0${r.id}`)).size;
    const data: ExpoMessage['data'] = threads.length === 1 ? { product: phoneSlugOf(device, product), id: item } : {};
    // A banner for at least one arrival, which `fresh` has.
    const say = phoneBanner(fresh.map((f) => (f.ask
      ? { kind: 'approval', title: f.title, thread: f.thread || f.named }
      : { kind: 'item', title: f.title || f.named })))!;
    const messages: ExpoMessage[] = phones.map((p) => ({ to: p.token, title: say.title, body: say.body, sound: 'default', badge, priority: 'high', channelId: 'default', data }));
    still();
    let reached = 0;
    if (messages.length) {
      let tickets: ExpoTicket[] | null | undefined = [];
      try { tickets = await send(messages); } catch (err) { once('send', `phone: could not send an alert: ${(err as PushError)?.message ?? err}`); }
      for (const [i, t] of (tickets ?? []).entries()) {
        if (t?.status === 'ok') { reached += 1; continue; }
        const why = t?.details?.error ?? t?.message ?? 'no answer';
        if (why === 'DeviceNotRegistered') {
          try { await backend.dropPushDevice!(messages[i].to, owner); } catch (err) { once('drop', `phone: could not forget a phone that stopped taking alerts: ${(err as PushError)?.message ?? err}`); }
        } else once(`ticket:${why}`, `phone: Expo did not take an alert: ${why}`);
      }
    }
    // The web app opens a thread by its id (renderer/src/phone-alerts.ts).
    for (const web of webs) if (await pushWeb(web, { title: say.title, body: say.body, count: badge, open: data.id ?? null })) reached += 1;
    if (!reached) return;
    said.clear();
    spoke = true;
    if (fresh.some((f) => f.ask)) spokeAsk = true;
    for (const f of fresh) state.alerted[f.key] = { stamp: f.stamp, at: now() };
    for (const [k, v] of Object.entries(state.alerted)) if (!(now() - (v?.at ?? 0) < ALERTED_KEPT_MS)) delete state.alerted[k];
    save();
  }

  return {
    arrived,
    pass,
    takesSetting,
    setting,
    /** She answered from her phone, so she has seen what it holds. */
    phoneUsed: () => { spoke = false; spokeAsk = false; },
  };
}

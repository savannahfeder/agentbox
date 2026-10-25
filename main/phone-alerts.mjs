// ALERTS ON HER PHONE'S LOCK SCREEN, SENT BY THIS MAC.
//
// The arrivals are the desktop banner's (main/notify.mjs, from App.tsx's
// inbox), and so are the rules (shared/notify-rules.mjs): nothing while she
// has used this Mac in the last five minutes, once per stretch away, once
// more for a permission card. They go out from the phone pass, after it has
// published, so the thread an alert opens is already on the phone. The
// server-side sender in docs/mobile/PLAN.md, which alerts with every Mac
// shut, is a later phase.
//
// The words are the phone banner's (phoneBanner): the thread's title in bold,
// asked for on 2026-10-13 and again on 2026-10-23, and nothing else of it.
import { atTheComputer, shouldSpeak, phoneBanner } from '../shared/notify-rules.mjs';

export const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
// Arrivals this close together are one alert.
export const FOLD_MS = 3000;
const DEADLINE_MS = 10_000;
const ALERTED_KEPT_MS = 30 * 24 * 3600_000;

// renderer/src/phone-rows.ts phoneSlug, which the phone opens a thread by.
const phoneSlugOf = (device, project) => `${project}@${device}`;
const stampOf = (item) => `${item.status ?? ''}:${item.wrote?.status?.ts ?? item.updatedAt ?? ''}`;

/** One request for every phone; Expo answers a ticket for each, in order. */
export async function sendToExpo(messages, { fetchImpl = fetch, url = EXPO_PUSH, deadlineMs = DEADLINE_MS } = {}) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(messages), signal: AbortSignal.timeout(deadlineMs) });
  const said = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(said?.data)) throw new Error(`Expo answered ${res.status}${said?.errors?.[0]?.message ? `: ${said.errors[0].message}` : ''}`);
  return said.data;
}

export function createPhoneAlerts({ backend, owner, device, state, save, now, log, idleMs, send = sendToExpo, still = () => {} }) {
  state.alerted ??= {};
  // In memory, as the desktop's banner keeps them: an arrival is news once.
  const queued = new Map();
  let firstAt = 0;
  let needsYou = [];
  let spoke = false;
  let spokeAsk = false;
  const said = new Set();
  const once = (kind, line) => { if (!said.has(kind)) log(line); said.add(kind); };
  const away = () => { try { return !atTheComputer({ idleMs: idleMs() }); } catch { return true; } };

  function seen() {
    queued.clear();
    spoke = false;
    spokeAsk = false;
  }

  /** What the desktop's notifier was told arrived, and the inbox it arrived in. */
  function arrived(list, inbox = []) {
    if (!Array.isArray(list) || !list.length) return;
    if (!away()) return seen();
    if (Array.isArray(inbox)) needsYou = inbox.filter((r) => r && typeof r.id === 'string' && typeof r.product === 'string');
    for (const a of list) {
      if (!a || typeof a.id !== 'string' || typeof a.product !== 'string') continue;
      const ask = a.kind === 'approval';
      const item = ask ? a.item : a.id;
      if (typeof item !== 'string') continue;
      if (!queued.size) firstAt = now();
      queued.set(ask ? `ask:${a.id}` : `${a.product}:${a.id}`, { ask, product: a.product, item, title: a.title, thread: a.thread });
    }
  }

  // `carried(slug, id)` is the thread's row when the phone has it, else null.
  async function pass(carried) {
    if (!away()) return seen();
    if (!queued.size || now() - firstAt < FOLD_MS) return;
    const fresh = [];
    for (const [key, q] of queued) {
      const row = carried(q.product, q.item);
      if (!row) continue;
      const stamp = q.ask ? 'asked' : stampOf(row);
      if (state.alerted[key]?.stamp !== stamp) fresh.push({ key, stamp, ...q, named: row.title });
    }
    queued.clear();
    if (!fresh.length || !shouldSpeak({ spoke, spokeAsk, waiting: fresh.map((f) => ({ kind: f.ask ? 'approval' : 'item' })) })) return;
    still();
    let phones;
    try { phones = await backend.pushDevices(owner); } catch (err) { once('read', `phone: could not read the phones to alert: ${err?.message ?? err}`); return; }
    if (!phones.length) return;
    const threads = [...new Set(fresh.map((f) => `${f.product}\0${f.item}`))];
    const [product, item] = threads[0].split('\0');
    const badge = new Set(needsYou.filter((r) => carried(r.product, r.id)).map((r) => `${r.product}\0${r.id}`)).size;
    const data = threads.length === 1 ? { product: phoneSlugOf(device, product), id: item } : {};
    const say = phoneBanner(fresh.map((f) => (f.ask
      ? { kind: 'approval', title: f.title, thread: f.thread || f.named }
      : { kind: 'item', title: f.title || f.named })));
    const messages = phones.map((p) => ({ to: p.token, title: say.title, body: say.body, sound: 'default', badge, priority: 'high', channelId: 'default', data }));
    still();
    let tickets;
    try { tickets = await send(messages); } catch (err) { once('send', `phone: could not send an alert: ${err?.message ?? err}`); return; }
    let reached = 0;
    for (const [i, t] of (tickets ?? []).entries()) {
      if (t?.status === 'ok') { reached += 1; continue; }
      const why = t?.details?.error ?? t?.message ?? 'no answer';
      if (why === 'DeviceNotRegistered') {
        try { await backend.dropPushDevice(messages[i].to, owner); } catch (err) { once('drop', `phone: could not forget a phone that stopped taking alerts: ${err?.message ?? err}`); }
      } else once(`ticket:${why}`, `phone: Expo did not take an alert: ${why}`);
    }
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
    /** She answered from her phone, so she has seen what it holds. */
    phoneUsed: () => { spoke = false; spokeAsk = false; },
  };
}

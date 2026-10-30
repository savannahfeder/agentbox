// HER ROWS ONLINE, AS THE PHONE DRAWS THEM AND WRITES TO THEM
// (docs/cloud/PHONE-PLAN.md, step 1). Plain functions with no page behind
// them, so the phone site (cloud-bridge.ts) and the phone app (mobile/) keep
// one copy of every rule.

import { REQUEST_CHANNELS } from '../../shared/bridge-map.mjs';
import { madeHere, phoneChoices, WAIT_STATES } from '../../shared/phone-snapshot.mjs';
import { runOfClaim } from '../../shared/cloud-kit.mjs';
import { isCarried } from '../../shared/cloud-carry.mjs';
import { Name } from '../../shared/product-name.mjs';
import { statusForReply } from './list-rules';
import { cloudPlaces } from './cloud-files';

export interface PhoneRows {
  // `cloud`: that computer leaves its threads ready for Agentbox Cloud (shared/cloud-kit.mjs).
  projects: { device: string; project: string; name: string; updated_at?: string; cloud?: boolean }[];
  threads: { device: string; project: string; item: string; snapshot: any; updated_at?: string }[];
  // `project` is null only on a 'setting', which is for the computer, not a thread.
  // `claimed_by` is `cloud:<run id>` when Agentbox Cloud took it with the computer away.
  commands: { id: string; device: string; project: string | null; item: string | null; kind: string; payload: any; created_at: string; claimed_at?: string | null; claimed_by?: string | null; taken_at: string | null; outcome: string | null }[];
}

export interface Waiting { product: string; id: string; at: number; text: string; refused?: string; cloud?: true }

// How long a refusal stays on her screen: long enough to be read the next time
// she looks, not forever.
const REFUSAL_SHOWN_MS = 24 * 3600_000;
const LANDING_SHOWN_MS = 2 * 3600_000;
// A run the Mac has not said is still going for this long is not drawn as
// running: the Mac went to sleep or lost the network mid-run, and its copy
// online would otherwise say "working" forever (main/phone-inbox.mjs sends it
// every two minutes while it runs).
export const LIVE_FOR_MS = 10 * 60_000;
export const UNDONE = 'refused: taken back on the phone';
// A PROJECT ON THE PHONE IS A PROJECT ON ONE COMPUTER (Codex's review of
// step 1, finding 4): the screens know it by its name there and that
// computer's id together, so two computers' projects of the same name stay two.
export const phoneSlug = (device: string, project: string) => `${project}@${device}`;
export function splitSlug(slug: string): { device: string; project: string } | null {
  const m = /^(.+)@([0-9a-f]{12})$/.exec(String(slug));
  return m ? { project: m[1], device: m[2] } : null;
}

// THE SAME THREAD ID ON TWO COMPUTERS (a store copied from one to the other)
// would be one row to the screens, which pick, pin and close by id (Codex's
// second review, finding 6). The first keeps its id; every other gets one of
// its own, made from where it lives, and is turned back at the boundary.
const fnv = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const aliasFor = (slug: string, item: string, n: number) => `w-${(fnv(`${slug}/${item}/${n}`) + fnv(`${n}/${item}/${slug}`)).slice(0, 10)}`;
export type Aliases = Record<string, { product: string; item: string }>;
/** The thread a screen's id stands for, in its project. */
export const realItem = (aliases: Aliases, product: string, id: string) => (aliases[id]?.product === product ? aliases[id].item : id);

/**
 * Her rows, as the inbox draws them: each thread as her computer last saw it,
 * with what she did on the phone since laid over it. A close or a snooze moves
 * the row at once; a new thread is a row of its own; a reply is a message of
 * hers in the thread, marked as waiting. What her computer turned down says
 * why, for a day after it did (second review, finding 9).
 */
export function phoneView(rows: PhoneRows, now = Date.now()) {
  const names = new Map(rows.projects.map((p) => [phoneSlug(p.device, p.project), p.name]));
  // Each project's stand-in folders, so a path in a message finds its file here (cloud-files.ts).
  const places = cloudPlaces(rows.threads, phoneSlug);
  // Two computers' projects of the same name, told apart by which computer.
  const twice = new Set(rows.projects.map((p) => p.name).filter((n, i, all) => all.indexOf(n) !== i));
  const products = rows.projects.map((p) => {
    const slug = phoneSlug(p.device, p.project);
    return { slug, name: twice.has(p.name) ? `${p.name} (${p.device.slice(0, 4)})` : p.name, dir: places.get(slug)?.dir ?? '', oneLiner: '', repoPath: places.get(slug)?.repo ?? '' };
  });
  const items = new Map<string, any>();
  const screenId = new Map<string, string>();
  const aliases: Aliases = {};
  const approvals: { id: string; at: number; product: string; item: string; tool: string; input: Record<string, unknown> }[] = [];
  const cards: Cards = {};
  // Every real id, and every id a new thread waiting on the phone shows under,
  // is spoken for before any stand-in is made, and a stand-in is never one of
  // them (Codex's third review, finding 6).
  const taken = new Set<string>([...rows.threads.map((t) => t.item), ...rows.commands.filter((c) => c.kind === 'new').map((c) => madeHere(c.id))]);
  const used = new Set<string>();
  const running: any[] = [];
  const waits = new Map<string, { state: string; tool?: string; until?: number }>();
  const threads =[...rows.threads].sort((a, b) => `${a.device}/${a.project}`.localeCompare(`${b.device}/${b.project}`));
  for (const t of threads) {
    const slug = phoneSlug(t.device, t.project);
    if (!names.has(slug) || !t.snapshot?.item) continue;
    let id = t.item;
    if (used.has(id)) {
      let n = 0;
      do { id = aliasFor(slug, t.item, n); n += 1; } while (taken.has(id) || used.has(id));
      aliases[id] = { product: slug, item: t.item };
    }
    used.add(id);
    screenId.set(`${slug}/${t.item}`, id);
    items.set(`${slug}/${t.item}`, { ...t.snapshot.item, id, product: slug, productName: names.get(slug) });
    // Its permission cards, but not one she has answered here already.
    for (const a of Array.isArray(t.snapshot.approvals) ? t.snapshot.approvals : []) {
      if (!a?.id || !a.card || rows.commands.some((c) => c.kind === 'approve' && c.payload?.approval === a.id && !c.taken_at)) continue;
      approvals.push({ id: String(a.id), at: Number(a.at) || 0, product: slug, item: id, tool: String(a.tool ?? 'unknown'), input: a.input ?? {} });
      cards[a.id] = { device: t.device, project: t.project, item: t.item, card: String(a.card) };
    }
    const live = t.snapshot.live;
    if (live && now - Number(live.at) < LIVE_FOR_MS) {
      running.push({
        itemId: id, product: slug, startedAt: Number(live.since) || 0,
        ...(live.where === 'cloud' ? { where: 'cloud' } : {}),
        ...(live.movable === true ? { movable: true } : {}),
        tail: [],
        activity: (Array.isArray(live.doing) ? live.doing : []).map((d: any, i: number) => ({ id: `live-${i}`, label: String(d?.label ?? ''), detail: '', startedAt: Number(d?.startedAt) || 0 })),
      });
    }
    // Why the computer has not started it, in its own words (shared/phone-snapshot.mjs phoneWaitsOf).
    const wait = t.snapshot.wait;
    if (wait && typeof wait === 'object' && WAIT_STATES.includes(wait.state)) waits.set(id, wait);
  }
  const waiting: Waiting[] = [];
  // Threads that start when the computer takes what was sent, or that the
  // computer says are waiting their turn: "Queued", not "Nothing running".
  const queued: string[] = [];
  const queue = (id: string) => { if (!queued.includes(id)) queued.push(id); };
  const runNow: string[] = [];
  const stalled: string[] = [];
  const shipping: string[] = [];
  const signInNeeded: Record<string, string> = {};
  const atLimit: Record<string, { tool: string; until: number }> = {};
  let paused = false;
  for (const [id, w] of waits) {
    if (w.state === 'queued' || w.state === 'next') queue(id);
    if (w.state === 'next') runNow.push(id);
    if (w.state === 'stalled') stalled.push(id);
    if (w.state === 'shipping') shipping.push(id);
    if (w.state === 'signin') signInNeeded[id] = String(w.tool ?? '');
    if (w.state === 'limit') atLimit[id] = { tool: String(w.tool ?? ''), until: Number(w.until) || 0 };
    if (w.state === 'paused') paused = true;
  }
  const ordered = [...rows.commands].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const c of ordered) {
    if (isPinSetting(c)) {
      const p = c.payload;
      const takenAt = c.taken_at ? Date.parse(c.taken_at) || 0 : null;
      const copyAt = Date.parse(rows.threads.find((t) => t.device === c.device && t.project === p.product && t.item === p.item)?.updated_at ?? '') || 0;
      const standing = takenAt === null ? !c.outcome : c.outcome === 'done' && copyAt < takenAt && now - takenAt < LANDING_SHOWN_MS;
      const key = `${phoneSlug(c.device, p.product)}/${p.item}`;
      const row = items.get(key);
      if (standing && row) items.set(key, { ...row, pinned: p.value === true });
      continue;
    }
    // Her computer's own hand-over to the cloud is not something she sent.
    if (c.kind === 'setting' || c.project === null || isCarried(c)) continue;
    const at = Date.parse(c.created_at) || now;
    const refused = c.outcome?.startsWith('refused') ? c.outcome.replace(/^refused:\s*/, '') : null;
    const takenAt = c.taken_at ? Date.parse(c.taken_at) || at : null;
    // A reply her Mac took shows until a copy of its thread made after that arrives.
    const copyAt = Date.parse(rows.threads.find((t) => t.device === c.device && t.project === c.project && t.item === c.item)?.updated_at ?? '') || 0;
    const landing = c.kind === 'reply' && c.outcome === 'done' && takenAt !== null && copyAt < takenAt && now - takenAt < LANDING_SHOWN_MS;
    if (takenAt !== null && !landing && !(refused && now - takenAt < REFUSAL_SHOWN_MS)) continue;
    // Taken back on the phone: nothing to show.
    if (c.outcome === UNDONE) continue;
    const slug = phoneSlug(c.device, c.project);
    const key = `${slug}/${c.item}`;
    const row = items.get(key);
    const id = screenId.get(key) ?? c.item;
    const cloud = c.kind === 'reply' && takenAt === null && !!runOfClaim(c.claimed_by);
    const said = (text: string) => waiting.push({ product: slug, id: id as string, at, text, ...(refused ? { refused } : {}), ...(cloud ? { cloud: true as const } : {}) });
    if (c.kind === 'reply' && c.item) {
      said(String(c.payload?.text ?? ''));
      if (!refused && takenAt === null && !cloud) queue(id as string);
      // Answered, as the window marks a row the moment she sends, so it is In
      // progress until her Mac takes it and its own copy says what happened.
      if (row && !refused) items.set(key, { ...row, status: statusForReply(row.status) ?? row.status, answer: String(c.payload?.text ?? ''), wrote: { ...row.wrote, answer: { ts: at, source: 'founder' } }, updatedAt: at });
    }
    else if (refused && c.item && (c.kind === 'close' || c.kind === 'snooze')) {
      said(c.kind === 'close' ? 'Close this thread' : Number(c.payload?.until) > 0 ? 'Move to Later' : 'Bring back from Later');
    } else if (c.kind === 'close' && row) items.set(key, { ...row, status: 'done', updatedAt: at });
    else if (c.kind === 'snooze' && row) items.set(key, { ...row, snoozedUntil: Number(c.payload?.until) || null, updatedAt: at });
    else if (c.kind === 'new' && names.has(slug)) {
      const made = madeHere(c.id);
      // Started in the cloud with the computer away: the copy the cloud wrote is the thread.
      const inCloud = takenAt === null && !!runOfClaim(c.claimed_by);
      if (inCloud && items.has(`${slug}/${made}`)) continue;
      if (!refused && !inCloud && takenAt === null) queue(made);
      items.set(`${slug}/${made}`, {
        id: made, product: slug, productName: names.get(slug), title: String(c.payload?.title || c.payload?.body || '').slice(0, 200),
        body: String(c.payload?.body ?? ''), kind: 'directive', labels: ['founder'], priority: 0, createdAt: at, updatedAt: at,
        ...(refused ? { status: 'blocked', result: `Your computer could not start this: ${refused}` } : inCloud ? { status: 'claimed' } : { status: 'open', waitsForMac: true }),
      });
    }
  }
  return { products, items: [...items.values()], waiting, aliases, running, queued, runNow, stalled, shipping, signInNeeded, atLimit, paused, places, approvals, cards };
}

/** What one thread's live line is told of the computer's queue, off the view (the phone app's thread page). */
export function waitFacts(view: Pick<ReturnType<typeof phoneView>, 'queued' | 'runNow' | 'stalled' | 'shipping' | 'signInNeeded' | 'atLimit' | 'paused'>, id: string) {
  return {
    queued: view.queued, runNow: view.runNow, signInNeeded: view.signInNeeded, atLimit: view.atLimit, paused: view.paused,
    stalled: view.stalled.includes(id), shipping: view.shipping.includes(id),
  };
}

const THREADS_MAX = 3000;
type ThreadRow = PhoneRows['threads'][number];
type Select = (table: string, query: string) => Promise<any[]>;
/**
 * Her threads, fetching only the copies new or changed since `cache` had them:
 * a light list of when each last changed, then the changed copies at once.
 * `cache` is kept up to date, and a thread gone from the list leaves it.
 */
export async function readThreads(select: Select, cache: Map<string, ThreadRow>): Promise<ThreadRow[]> {
  const keyOf = (t: { device: string; project: string; item: string }) => `${t.device}/${t.project}/${t.item}`;
  const light: ThreadRow[] = await select('phone_threads', `select=device,project,item,updated_at&order=updated_at.desc&limit=${THREADS_MAX}`);
  const changed = light.filter((t) => cache.get(keyOf(t))?.updated_at !== t.updated_at);
  if (changed.length) {
    const since = changed.map((t) => String(t.updated_at ?? '')).sort()[0];
    const fresh: ThreadRow[] = await select('phone_threads', `select=device,project,item,snapshot,updated_at${since ? `&updated_at=gte.${encodeURIComponent(since)}` : ''}&order=updated_at.desc&limit=${THREADS_MAX}`);
    for (const t of fresh) cache.set(keyOf(t), t);
  }
  const here = new Set(light.map(keyOf));
  for (const k of [...cache.keys()]) if (!here.has(k)) cache.delete(k);
  return light.map((t) => cache.get(keyOf(t))).filter((t): t is ThreadRow => !!t);
}

// Whole rows, so a column the live database does not have yet is never an error.
const COMMANDS = 'select=*&order=created_at';
export const PROJECTS_SELECT = 'select=*&order=name';
// Every command still waiting, however old (Codex's review of step 1,
// finding 10), and those taken in the last two days, for what they say.
export async function readCommands(select: Select, now = Date.now()): Promise<PhoneRows['commands']> {
  const waiting: PhoneRows['commands'] = [];
  for (let from = 0; ; from += 500) {
    const page = await select('phone_commands', `${COMMANDS}&taken_at=is.null&offset=${from}&limit=500`);
    waiting.push(...page);
    if (page.length < 500) break;
  }
  const since = new Date(now - 2 * 24 * 3600_000).toISOString();
  const done = await select('phone_commands', `${COMMANDS}&taken_at=gte.${since}&limit=500`);
  return [...waiting, ...done];
}

/** Each computer's settings as it last sent them (shared/phone-settings.mjs), newest first. */
export const readSettingsRows = (select: Select) => select('phone_settings', 'select=device,name,settings,updated_at&order=updated_at.desc&limit=20');

/** A change for one computer's settings, which its own handlers carry out. */
export function settingCommand(device: string, change: { scope: 'workspace' | 'project' | 'thread' | 'repeat' | 'teammate'; key: string; value: unknown; product?: string; item?: string; id?: string }) {
  return { device, project: null, item: null, kind: 'setting', payload: change };
}
const isPinSetting = (c: PhoneRows['commands'][number]) => c.kind === 'setting' && c.payload?.scope === 'thread' && c.payload?.key === 'pinned'
  && typeof c.payload?.product === 'string' && typeof c.payload?.item === 'string';

// Each card drawn on the phone: where it is, and the fingerprint her Mac drew it with.
export type Cards = Record<string, { device: string; project: string; item: string; card: string }>;
/** Her answer to a card, for her Mac, carrying the fingerprint it was drawn with; null for a card never drawn. */
export function approvalCommand(cards: Cards, p: { id: string; allow: boolean; note?: string }) {
  const c = cards[p?.id];
  if (!c) return null;
  return { device: c.device, project: c.project, item: c.item, kind: 'approve', payload: { approval: p.id, allow: p.allow === true, ...(typeof p.note === 'string' && p.note ? { note: p.note } : {}), card: c.card } };
}

/** The thread's lines as her computer sent them, for the thread view. */
export function phoneHistory(rows: PhoneRows, product: string, id: string, aliases: Aliases = {}) {
  const item = realItem(aliases, product, id);
  const t = rows.threads.find((r) => phoneSlug(r.device, r.project) === product && r.item === item);
  return { ok: true, lines: Array.isArray(t?.snapshot?.history) ? t.snapshot.history.map((l: any) => ({ ...l, id })) : [] };
}

/** What one press on the phone leaves for her Mac, or null for a press that is not one of the four. */
// UNDO OF A CLOSE MADE ON THE PHONE takes the close back while it is still
// waiting: the phone marks its own command taken, as undone, and the computer
// never sees it. Once the computer has closed the thread, undoing is the
// computer's. Returns the command to take back, or null.
export function closeToTakeBack(rows: PhoneRows, channel: string, p: any, aliases: Aliases = {}) {
  if (channel !== REQUEST_CHANNELS.answer || p?.status !== 'open' || (typeof p.answer === 'string' && p.answer.trim())) return null;
  return waitingFor(rows, p, aliases, 'close');
}

// The same for a reply, when the window stops the agent to undo it, and for a
// new thread, closed by the id the inbox drew it with.
export function takeBack(rows: PhoneRows, channel: string, p: any, aliases: Aliases = {}) {
  if (channel === REQUEST_CHANNELS.stopSession) return p?.withdraw ? waitingFor(rows, p, aliases, 'reply') : null;
  if (channel === REQUEST_CHANNELS.answer && p?.status === 'done' && !(typeof p.answer === 'string' && p.answer.trim())) {
    const where = splitSlug(p.product);
    return rows.commands.find((c) => c.kind === 'new' && !c.taken_at && !c.claimed_at && c.device === where?.device && c.project === where?.project && madeHere(c.id) === p.id) ?? null;
  }
  return closeToTakeBack(rows, channel, p, aliases);
}

function waitingFor(rows: PhoneRows, p: any, aliases: Aliases, kind: string) {
  const where = splitSlug(p?.product);
  if (!where) return null;
  const item = realItem(aliases, p.product, p.id);
  return rows.commands.filter((c) => c.kind === kind && !c.taken_at && !c.claimed_at && c.device === where.device && c.project === where.project && c.item === item).at(-1) ?? null;
}

export function commandFor(channel: string, p: any, aliases: Aliases = {}): { device: string; project: string; item: string | null; kind: string; payload: Record<string, unknown> } | null {
  const where = splitSlug(p?.product);
  if (!where) return null;
  const on = (item: string | null, kind: string, payload: Record<string, unknown>) => ({ ...where, item: item === null ? null : realItem(aliases, p.product, item), kind, payload });
  if (channel === REQUEST_CHANNELS.answer) {
    if (typeof p.answer === 'string' && p.answer.trim()) return on(p.id, 'reply', { text: p.answer, ...phoneChoices('reply', p) });
    if (p.status === 'done') return on(p.id, 'close', {});
    return null;
  }
  if (channel === REQUEST_CHANNELS.snooze && Number.isFinite(p.snoozedUntil) && p.snoozedUntil >= 0) return on(p.id, 'snooze', { until: p.snoozedUntil });
  if (channel === REQUEST_CHANNELS.schedule && Number.isFinite(p.runAt) && p.runAt >= 0) return on(p.id, 'schedule', { runAt: p.runAt });
  const plain: Record<string, string> = { [REQUEST_CHANNELS.stopSession]: 'stop', [REQUEST_CHANNELS.runNow]: 'run-now', [REQUEST_CHANNELS.sendNow]: 'send-now', [REQUEST_CHANNELS.reopen]: 'reopen', [REQUEST_CHANNELS.moveToCloud]: 'move-to-cloud' };
  if (plain[channel] && p.id) return on(p.id, plain[channel], {});
  if (channel === REQUEST_CHANNELS.compose && (String(p.title ?? '').trim() || String(p.body ?? '').trim())) {
    return on(null, 'new', { title: String(p.title ?? ''), body: String(p.body ?? ''), ...phoneChoices('new', p) });
  }
  return null;
}

export const ago = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};
// Allow missed heartbeats before declaring the computer away.
const MAC_AWAY_MS = 90_000;
/** The line over her inbox when what it shows may be out of date, or null. */
export function phoneStatusLine({ error, fetchedAt, macSeen, cloud = false }: { error: string | null; fetchedAt: number; macSeen: number; cloud?: boolean }, now = Date.now()): string | null {
  if (error) return `Can't reach your inbox online.${fetchedAt ? ` This is how it was ${ago(now - fetchedAt)}.` : ''}`;
  if (macSeen && now - macSeen > MAC_AWAY_MS) return cloud ? `Your computer is off. Replies carry on in ${Name} Cloud.` : `Your computer was last online ${ago(now - macSeen)}. What you send waits for it.`;
  return null;
}
/**
 * Signed in to an account no computer has sent a project to: the page says
 * so, and which account it is, in place of an inbox that would read as empty.
 */
export function phoneConnectState({ signedIn, started, error, projects, email }: { signedIn: boolean; started: boolean; error: string | null; projects: unknown[]; email: string | null | undefined }): { email: string | null } | null {
  if (!signedIn || !started || error || projects.length) return null;
  return { email: email || null };
}
/** For the web app's Account page: where the computer is, and what happens to what is sent meanwhile. */
export function computerSays({ seenAt, cloud }: { seenAt: number; cloud: boolean }, now = Date.now()): { label: string; desc: string } {
  if (!seenAt) return { label: 'No computer connected yet', desc: `Open ${Name} on your computer and sign in to this account in Settings › Phone.` };
  if (now - seenAt <= MAC_AWAY_MS) return { label: 'Your computer is online', desc: 'New threads and replies start there within a few seconds.' };
  const label = `Your computer was last online ${ago(now - seenAt)}`;
  return cloud
    ? { label, desc: `${Name} Cloud starts your new threads and replies while it is off.` }
    : { label, desc: `What you send waits for it. To keep agents running with the lid shut, set up ${Name} Cloud on your computer.` };
}
/** Whether a computer of hers leaves its threads ready for Agentbox Cloud. */
export const cloudCarriesOn = (projects: { cloud?: boolean }[]) => projects.some((p) => p.cloud === true);
/** When the most recently seen of her computers last wrote its projects. */
export const macSeenOf = (projects: { updated_at?: string }[]) => Math.max(0, ...projects.map((p) => Date.parse(p.updated_at ?? '') || 0));

export const NOT_HERE = 'Your computer does this. Your phone can reply, start a thread, close, and move things to Later.';

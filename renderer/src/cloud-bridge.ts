// THE PHONE WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1).
//
// The same screens as the phone that talks to the Mac (browser-bridge.ts), on
// a site of their own, and a `window.zero` built out of her rows online
// instead of out of a Mac: the copies her Mac last sent of each thread of the
// projects she put on her phone, and the commands her phone has left for it.
//
// It does four things and nothing else (Codex's review, finding 13): it reads,
// and it leaves a reply, a new thread, a snooze or a close for her Mac. Each
// shows "Waiting for your Mac" until her Mac takes it. Every other door of the
// app answers as a door that is not here, except feedback, which goes straight
// to the feedback function because it is not her Mac's to do.
//
// The page has it only when the site's build put the cloud's public address
// in the page (`<meta name="agentbox-cloud">`, scripts/build-phone-site.mjs).
// The desktop window and the Mac's own phone page never have that.

import { REQUEST_CHANNELS, PUSH_CHANNELS, DESKTOP_ONLY } from '../../shared/bridge-map.mjs';
import { feedbackPayload, sendFeedback } from '../../shared/feedback.mjs';
import { cloudClient, type CloudClient, type CloudConfig } from './cloud-rest';
import { installPhoneScreen } from './phone-screen';
import { atMostEvery } from './phone-polls';
import { setPictureLinks } from './picture';
import { SEND_MAX_BYTES, sendFiles, sentFileName } from './phone-sends-files';
import { LINK_RENEW_MS, fileOnPhone, linkForFile, linkOfEntry as linkOfName, objectsToSign, phonePage, renewLinks, type Links } from './phone-links';
import { BUCKET, cloudPlaces, findFile, findFolder, installCloudFiles, type Place } from './cloud-files';
import {
  LIVE_FOR_MS, NOT_HERE, PROJECTS_SELECT, cloudCarriesOn, macSeenOf, phoneHistory, phoneSlug, phoneStatusLine,
  phoneView, readCommands, readThreads, splitSlug, type Aliases, type PhoneRows,
} from './phone-rows';
import { phoneSender } from './phone-send';

export {
  NOT_HERE, UNDONE, approvalCommand, closeToTakeBack, commandFor, macSeenOf, phoneHistory, phoneSlug, phoneStatusLine,
  phoneView, readCommands, readThreads, realItem, splitSlug, takeBack, type Aliases, type Cards, type PhoneRows, type Waiting,
} from './phone-rows';

type Push = (payload: unknown) => void;

// THE DOORS THAT ONLY READ, answered here as a door with nothing behind it.
// Every other door changes something on her computer that the phone cannot
// reach, so it says so rather than answering as if it had (Codex's review of
// step 1, finding 7: Stop said the agent stopped when nothing had).
const READS = new Set([
  'refreshUsage', 'assistiveTech', 'olderItems', 'commandCatalog', 'compactionStatus',
  'firstRunExamples', 'firstRunWalking', 'listFolders', 'folderExists', 'agentFiles', 'agentFolders',
  'agentThreads', 'cornerTag', 'bootInfo', 'updateCheck', 'instructionRead', 'instructionHistory',
  'instructionVersion', 'standingRead', 'messageRulesRead', 'settingsRead', 'engineBin',
  'cloudClipboardCode', 'projectInstructionsRead', 'codeFile', 'railNote',
  'agentConversation', 'phoneLink', 'teamStatus',
  // Where she dragged a row or a project to: kept on this page, not sent.
  'setThreadPlaces', 'setThreadPins', 'setProductOrder', 'setProductHidden',
]);
export function readCloudConfig(doc: Document = document): CloudConfig | null {
  const raw = doc.querySelector('meta[name="agentbox-cloud"]')?.getAttribute('content');
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    return typeof c?.url === 'string' && typeof c?.anonKey === 'string' ? { url: c.url, anonKey: c.anonKey } : null;
  } catch { return null; }
}

// The same server function the Mac's card posts to (main/feedback.mjs), on the
// cloud this site was built for, which is also the one origin its page may reach.
export const feedbackAddressOn = (cfg: CloudConfig) => new URL('/functions/v1/feedback', cfg.url).href;

type FeedbackFiles = { name: string; type: string; data: string }[];
export function sendPhoneFeedback(cfg: CloudConfig, { text, files }: { text: string; files: FeedbackFiles }, fetchImpl: (url: string, init: RequestInit) => Promise<{ ok: boolean }> = (u, i) => fetch(u, i)) {
  return sendFeedback({ url: feedbackAddressOn(cfg), payload: feedbackPayload({ text, files, app: { version: '', os: 'phone website' } }), fetchImpl });
}

const SUPERVISOR = { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: [], hiddenProducts: [], personalProducts: [], capacity: 0 };
const EMPTY_ROWS: PhoneRows = { projects: [], threads: [], commands: [] };

export function installCloudBridge(cfg: CloudConfig | null = typeof document === 'undefined' ? null : readCloudConfig()): boolean {
  if (!cfg || typeof window === 'undefined' || (window as any).zero) return false;
  const client: CloudClient = cloudClient(cfg, { storage: localStorage, fetchImpl: (u, i) => fetch(u, i) });
  document.documentElement.dataset.door = 'phone';
  document.documentElement.dataset.via = 'cloud';
  document.documentElement.dataset.shell = 'tab';
  installPhoneScreen();
  // There is nothing to walk through here: her projects are on her Mac.
  try { localStorage.setItem('zero.firstRun.done', '1'); } catch { /* private mode */ }

  let rows: PhoneRows = EMPTY_ROWS;
  let started = false;
  // The screen ids of threads that share an id with another computer's.
  let aliases: Aliases = {};
  let error: string | null = null;
  let last = '';
  // Her files' links (phone-links.ts), and each page made ready.
  let places = new Map<string, Place>();
  const links: Links = new Map();
  // A page made ready is good while every file it points at keeps its name
  // and its link; at most a few are kept.
  const pages = new Map<string, { url: string; keys: string[]; names: string; until: number }>();
  const dropPage = (key: string) => { const p = pages.get(key); if (p) URL.revokeObjectURL(p.url); pages.delete(key); };
  async function signLinks() {
    const owner = client.session()?.user.id;
    if (!owner) return;
    const asked = client.generation();
    await renewLinks((paths, seconds) => client.signFiles(BUCKET, paths, seconds), objectsToSign(places, rows.commands, links, owner), links, () => client.generation() === asked);
  }
  const linkOfEntry = (n?: string) => linkOfName(links, n);
  const linkFor = (file: string) => linkForFile(places, links, file);
  setPictureLinks(linkFor);
  installCloudFiles(linkFor);
  const listeners = new Map<string, Set<Push>>();
  const deliver = (channel: string, payload?: unknown) => {
    for (const fn of listeners.get(channel) ?? []) { try { fn(payload); } catch { /* its own fault */ } }
  };
  const changed = atMostEvery(1000, (payload?: unknown) => deliver(PUSH_CHANNELS.onChanged, payload));

  const commands = () => readCommands((table, query) => client.select(table, query));

  // One read at a time: on a slow network a read can outlast the five seconds between them.
  let reading: Promise<void> | null = null;
  // Her threads' copies as last fetched; a read fetches only what changed since.
  const threadCache = new Map<string, PhoneRows['threads'][number]>();
  let fetchedAt = 0;
  function refresh() {
    if (reading) return reading;
    reading = readRows().finally(() => { reading = null; });
    return reading;
  }
  async function readRows() {
    if (!client.signedIn()) { rows = EMPTY_ROWS; return; }
    const asked = client.generation();
    try {
      const [projects, threads, cmds] = await Promise.all([
        client.select('phone_projects', PROJECTS_SELECT),
        readThreads((table, query) => client.select(table, query), threadCache),
        commands(),
      ]);
      // Read for a sign-in that has since ended: not hers to show.
      if (client.generation() !== asked) { threadCache.clear(); return; }
      rows = { projects, threads, commands: cmds };
      places = cloudPlaces(threads, phoneSlug);
      error = null;
      fetchedAt = Date.now();
      // Links before the screens draw, so a picture is pointed at its file the moment it is drawn.
      await signLinks().catch(() => { /* the pictures say missing, the words still read */ });
    } catch (err) {
      if (client.generation() !== asked) return;
      if (!client.signedIn()) rows = EMPTY_ROWS;
      error = String((err as Error)?.message ?? err);
    }
    // A run going stale changes nothing online, and still has to stop being drawn.
    const fresh = rows.threads.map((t) => !!t.snapshot?.live && Date.now() - Number(t.snapshot.live.at) < LIVE_FOR_MS);
    const key = JSON.stringify([rows.threads.map((t) => [t.item, t.updated_at]), fresh, links.size, rows.commands.map((c) => [c.id, c.taken_at, c.claimed_by ?? null]), rows.projects, error, client.signedIn(), phoneStatusLine({ error, fetchedAt, macSeen: macSeenOf(rows.projects), cloud: cloudCarriesOn(rows.projects) })]);
    if (key !== last) { last = key; changed(null); }
  }

  // WHILE SHE IS LOOKING, every five seconds; nothing while the page is hidden.
  // Live updates are step 3.
  const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', tick);

  // Back from Google with a code: finish signing in, and take the code out of
  // the address bar (it is spent, and a screenshot should not carry it).
  // A new account's email link comes back the same way, its sign-in after `#`.
  const code = new URL(location.href).searchParams.get('code');
  const emailLink = /(^|[#&])(access_token|error)=/.test(location.hash) ? location.hash : '';
  const boot = (async () => {
    if (code) {
      const url = new URL(location.href);
      url.searchParams.delete('code');
      history.replaceState(history.state, '', url.toString());
      try { await client.finishGoogle(code); } catch (err) { error = String((err as Error)?.message ?? err); }
    } else if (emailLink) {
      history.replaceState(history.state, '', location.pathname + location.search);
      try { await client.finishEmailLink(emailLink); } catch (err) { error = String((err as Error)?.message ?? err); }
    }
    await refresh();
    started = true;
    changed(null);
  })();

  const team = () => (client.signedIn()
    // Signed in, the page is the single-person app's: no team pages here.
    ? null
    : { configured: true, started, signedIn: false, signingIn: null, me: null, team: null, invites: [], sent: [], people: [], cards: [], lastSyncAt: null, error });

  const sender = phoneSender({ client, rows: () => rows, setRows: (next) => { rows = next; }, aliases: () => aliases, changed: () => changed(null) });
  const signedInThen = async (fn: () => Promise<unknown>) => {
    try { await fn(); error = null; await refresh(); changed(null); return { ok: true }; } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  };

  const bridge: Record<string, unknown> = {};
  // A door that reads answers as one with nothing behind it: the screens treat
  // a null as "nothing to show". Every other door says it is not here.
  for (const name of Object.keys(REQUEST_CHANNELS)) bridge[name] = READS.has(name) ? async () => null : async () => { throw new Error(NOT_HERE); };
  for (const name of DESKTOP_ONLY) bridge[name] = () => null;
  for (const [name, channel] of Object.entries(PUSH_CHANNELS)) {
    bridge[name] = (fn: Push) => {
      const set = listeners.get(channel) ?? new Set<Push>();
      listeners.set(channel, set);
      set.add(fn);
      return () => set.delete(fn);
    };
  }

  Object.assign(bridge, {
    async snapshot() {
      await boot;
      const view = phoneView(rows);
      aliases = view.aliases;
      return {
        products: view.products, items: view.items, phoneWaiting: view.waiting,
        phoneStatus: client.signedIn() ? phoneStatusLine({ error, fetchedAt, macSeen: macSeenOf(rows.projects), cloud: cloudCarriesOn(rows.projects) }) : null,
        team: team(), agents: [], approvals: view.approvals, supervisor: { ...SUPERVISOR, running: view.running, productOrder: view.products.map((p) => p.slug) },
        engines: null, runsOn: null, restartNeeded: null, cloud: null,
        config: { browserHome: '', browserPins: [], outsideAgents: 'off' },
      };
    },
    itemHistory: async ({ product, id, before }: { product: string; id: string; before?: number }) => {
      const read = phoneHistory(rows, product, id, aliases);
      return Number.isFinite(before) ? { ...read, lines: read.lines.filter((l: any) => l.ts <= (before as number)) } : read;
    },
    // Whether Claude Code or Codex has an update is the computer's to say;
    // starting one is the computer's to do.
    agentUpdate: async (p: any) => { if (p?.action === 'start') throw new Error(NOT_HERE); return null; },
    sessionTrace: async () => ({ sessions: [] }),
    repeats: async () => [],
    // Her Mac runs the agents; nothing here asks her to set one up.
    engineSetup: async () => ({ ok: true, phase: 'ready', found: true, signedIn: true }),
    dashboard: async () => null,
    codeChange: async () => ({ ok: false }),
    // What a press leaves for her Mac, the same doors the phone app sends through (phone-send.ts).
    ...sender,
    sendFeedback: (p: { text: string; files: FeedbackFiles }) => sendPhoneFeedback(cfg, p),
    badge: async () => null,
    notify: async () => null,
    track: async () => null,
    crash: async () => null,
    teamSignIn: () => signedInThen(async () => { location.assign(await client.googleUrl(`${location.origin}${location.pathname}`)); }),
    teamSignInCancel: async () => ({ ok: true }),
    teamSignInReopen: async () => ({ ok: true }),
    teamSignInEmail: ({ email, password }: { email: string; password: string }) => signedInThen(() => client.signInWithPassword(email, password)),
    teamSignUp: ({ name, email, password }: { name: string; email: string; password: string }) => signedInThen(async () => {
      const out = await client.signUp(name, email, password, `${location.origin}${location.pathname}`);
      if (out.confirm) throw new Error('Check your email to confirm it, then sign in here.');
    }),
    teamSignOut: async () => {
      client.signOut(); rows = EMPTY_ROWS; error = null; threadCache.clear();
      places = new Map(); links.clear();
      for (const key of [...pages.keys()]) dropPage(key);
      changed(null);
      return { ok: true };
    },
    // A picture in a reply goes to her storage first (phone-sends-files.ts).
    saveAttachments: async ({ product, files }: { product: string; files: Array<{ name: string; dataBase64?: string }> }) => {
      const where = splitSlug(product);
      const owner = client.session()?.user.id;
      if (!where || !owner) throw new Error(NOT_HERE);
      return sendFiles({ put: (object, bytes, type) => client.putFile(BUCKET, object, bytes, type), owner, device: where.device, files, maxBytes: SEND_MAX_BYTES });
    },
    // HER FILES, from the links her Mac's list gives (cloud-files.ts).
    openArtifact: async (p: { product: string; src: string; mode?: string }) => {
      const at = fileOnPhone(places, links, p?.product, p?.src);
      if (!at.ok) return at;
      if (at.sent) {
        if (p.mode !== 'resolve') window.open(at.link, '_blank', 'noopener');
        return { ok: true, opened: p.src };
      }
      const { found, link } = at;
      if (p.mode === 'resolve') {
        if (!/\.html?$/i.test(found.key)) return { ok: true, opened: found.file };
        const cacheKey = `${client.session()?.user.id}|${p.product}|${found.key}`;
        const namesOf = (keys: string[]) => keys.map((k) => found.place.files.get(k)?.n ?? '').join('|');
        const kept = pages.get(cacheKey);
        if (kept && kept.until > Date.now() && kept.names === namesOf(kept.keys)) return { ok: true, opened: found.file, url: kept.url };
        dropPage(cacheKey);
        const asked = client.generation();
        const read = async (url: string) => { const res = await fetch(url); if (!res.ok) throw new Error('This page could not be read.'); return res.text(); };
        try {
          const { html, used } = await phonePage(found, link, links, read);
          if (client.generation() !== asked) return { ok: false, error: 'You signed out.' };
          const until = Math.min(Infinity, ...used.map((k) => links.get(found.place.files.get(k)?.n ?? '')?.until).filter((u): u is number => !!u)) - LINK_RENEW_MS;
          const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
          pages.set(cacheKey, { url, keys: used, names: namesOf(used), until });
          while (pages.size > 12) dropPage(pages.keys().next().value!);
          return { ok: true, opened: found.file, url };
        } catch (err) {
          return { ok: false, error: String((err as Error)?.message ?? err) };
        }
      }
      window.open(link, '_blank', 'noopener');
      return { ok: true, opened: found.file };
    },
    readDoc: async (p: { product: string; src: string }) => {
      const sent = sentFileName(p?.src);
      const found = sent ? null : findFile(places, p?.product, p?.src);
      const link = sent ? linkOfEntry(sent) : found && linkOfEntry(found.entry.n);
      if (!link) return { ok: false, error: found?.entry.big ? 'This file is too big for your phone.' : 'This file is on your computer.' };
      const asked = client.generation();
      const res = await fetch(link);
      const text = res.ok ? await res.text() : null;
      if (client.generation() !== asked) return { ok: false, error: 'You signed out.' };
      return text !== null ? { ok: true, text, mtime: 0 } : { ok: false, error: 'This file could not be read.' };
    },
    folderPictures: async (p: { product: string; src: string }) => {
      const place = places.get(p?.product);
      const found = place && findFolder(place, p.src);
      if (!place || !found) return { ok: false, error: 'This folder is on your computer.' };
      return { ok: true, folder: found.folder, pictures: found.keys.map((k) => (k.startsWith('@repo/') ? `${place.repo}/${k.slice(6)}` : `${place.dir}/${k}`)), total: found.keys.length };
    },
  });

  (window as any).zero = bridge;
  return true;
}

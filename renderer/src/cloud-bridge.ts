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
import { feedbackAddressOn, sendPhoneFeedback, type FeedbackFiles } from './phone-feedback';
import { cloudClient, type CloudClient, type CloudConfig } from './cloud-rest';
import { installPhoneScreen } from './phone-screen';
import { atMostEvery } from './phone-polls';
import { pictureLinksChanged, setPictureLinks } from './picture';
import { SEND_MAX_BYTES, sendFiles, sentFileName } from './phone-sends-files';
import { LINK_RENEW_MS, fileOnPhone, linkForFile, linkOfEntry as linkOfName, objectsToSign, phonePage, renewLinks, type Links } from './phone-links';
import { BUCKET, cloudPlaces, findFile, findFolder, installCloudFiles, type Place } from './cloud-files';
import {
  LIVE_FOR_MS, NOT_HERE, PROJECTS_SELECT, cloudCarriesOn, macSeenOf, phoneConnectState, phoneHistory, phoneSlug, phoneStatusLine,
  phoneView, readCommands, readSettingsRows, readThreads, splitSlug, type Aliases, type PhoneRows,
} from './phone-rows';
import { dictationAllowed, setDictationAllowed } from './web-speech';
import { phoneSender } from './phone-send';
import { phoneRepeats } from './phone-repeats';
import { setIconCount, startPhoneAlerts } from './phone-alerts';
import { cloudAlertsVia } from './cloud-alerts';
import { computerOf, type Change, type SettingsRow } from './phone-settings-view';
import { computerAgents, webSettingChange, webSettingsModel, phoneEngines, phoneModelRefusal } from './web-settings';
import { groupsOn, groupsSnapshot, phoneGroups } from './phone-groups';

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
  'setThreadPlaces', 'setProductOrder', 'setProductHidden',
]);
// The reads whose callers take a field off the answer: each gets an empty
// answer of its own shape, not null (tests/the-done-tab-opens-on-the-web-app).
const ON_COMPUTER = 'This is on your computer.';
export const EMPTY_READS = {
  olderItems: async () => ({ items: [], more: false }),
  commandCatalog: async () => [],
  codeFile: async () => ({ ok: false, error: ON_COMPUTER }),
  railNote: async () => ({ ok: false, error: ON_COMPUTER }),
  agentConversation: async () => ({ ok: false, reason: ON_COMPUTER }),
  refreshUsage: async () => ({ ok: false, error: ON_COMPUTER }),
  // Settings opens on the pages a browser keeps; the computer's own are not drawn here.
  settingsRead: async () => ({ ok: true, workspace: null, projects: [] }),
};

export function readCloudConfig(doc: Document = document): CloudConfig | null {
  const raw = doc.querySelector('meta[name="agentbox-cloud"]')?.getAttribute('content');
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    return typeof c?.url === 'string' && typeof c?.anonKey === 'string' ? { url: c.url, anonKey: c.anonKey } : null;
  } catch { return null; }
}

/** The commit this site was built from, stamped by scripts/build-phone-site.mjs. */
export function readBuildStamp(doc: Pick<Document, 'querySelector'> = document): { sha: string; at: number } | null {
  const m = /^([0-9a-f]{40}) (\S+)$/.exec(doc.querySelector('meta[name="agentbox-build"]')?.getAttribute('content') ?? '');
  const at = m ? Date.parse(m[2]) : NaN;
  return m && Number.isFinite(at) ? { sha: m[1].slice(0, 7), at } : null;
}

// The cloud this site was built for is also the one origin its page may reach.
export { feedbackAddressOn, sendPhoneFeedback };

// How often the computer's settings copy is read for the agents To offers.
const AGENTS_EVERY_MS = 5 * 60_000;
const SUPERVISOR = { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: [], hiddenProducts: [], personalProducts: [], capacity: 0 };
const EMPTY_ROWS: PhoneRows = { projects: [], threads: [], commands: [] };

export function installCloudBridge(cfg: CloudConfig | null = typeof document === 'undefined' ? null : readCloudConfig()): boolean {
  if (!cfg || typeof window === 'undefined' || (window as any).zero) return false;
  const client: CloudClient = cloudClient(cfg, { storage: localStorage, fetchImpl: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(15_000) }) });
  const build = readBuildStamp();
  document.documentElement.dataset.door = 'phone';
  document.documentElement.dataset.via = 'cloud';
  document.documentElement.dataset.shell = 'tab';
  installPhoneScreen();
  // There is nothing to walk through here: her projects are on her Mac.
  try { localStorage.setItem('zero.firstRun.done', '1'); } catch { /* private mode */ }

  let rows: PhoneRows = EMPTY_ROWS;
  let settingsRows: SettingsRow[] = [];
  // The desktop's Groups, read straight from the account while the computer has them on.
  const groups = phoneGroups(client);
  // This phone's alerts go to every computer of the account, newest first (cloud-alerts.ts).
  const computers = () => [...rows.projects]
    .sort((a, b) => (Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0))
    .map((p) => p.device).filter((d, i, all) => all.indexOf(d) === i);
  const alertsVia = cloudAlertsVia({ computers, send: (cmd) => client.insertCommand(cmd), storage: localStorage, subtle: crypto.subtle });
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
    const want = objectsToSign(places, rows.commands, links, owner);
    if (!want.length) return;
    await renewLinks((paths, seconds) => client.signFiles(BUCKET, paths, seconds), want, links, () => client.generation() === asked);
    pictureLinksChanged();
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

  // Whether this account dictates, by the plan its computer last read (web-speech.ts).
  const PLAN_READ_MS = 60_000;
  let planReadAt = -Infinity;
  async function readPlan() {
    if (!client.signedIn()) { planReadAt = -Infinity; settingsRows = []; setDictationAllowed(false); return; }
    if (Date.now() - planReadAt < PLAN_READ_MS) return;
    planReadAt = Date.now();
    const asked = client.generation();
    try {
      const next = await readSettingsRows((table, query) => client.select(table, query));
      if (client.generation() === asked) {
        const different = JSON.stringify(next) !== JSON.stringify(settingsRows);
        settingsRows = next;
        setDictationAllowed(dictationAllowed(next));
        if (different) window.dispatchEvent(new Event('agent-models-changed'));
      }
    } catch { /* the microphone stays as it was until the next read */ }
  }

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
    await readPlan();
    if (!client.signedIn()) { rows = EMPTY_ROWS; return; }
    const asked = client.generation();
    try {
      const [projects, threads, cmds] = await Promise.all([
        client.select('phone_projects', PROJECTS_SELECT),
        readThreads((table, query) => client.select(table, query), threadCache),
        commands(),
        // Its own failures are said on its own page (RoomsState.error), not over the inbox.
        groupsOn(settingsRows) ? groups.refresh() : null,
      ]);
      // Read for a sign-in that has since ended: not hers to show.
      if (client.generation() !== asked) { threadCache.clear(); return; }
      rows = { projects, threads, commands: cmds };
      places = cloudPlaces(threads, phoneSlug);
      error = null;
      fetchedAt = Date.now();
      void alertsVia.catchUp().catch(() => { /* tried again at the next read */ });
      // Links before the screens draw, so a picture is pointed at its file the moment it is drawn.
      await signLinks().catch(() => { /* the pictures say missing, the words still read */ });
    } catch (err) {
      if (client.generation() !== asked) return;
      if (!client.signedIn()) rows = EMPTY_ROWS;
      error = String((err as Error)?.message ?? err);
    }
    // A run going stale changes nothing online, and still has to stop being drawn.
    const fresh = rows.threads.map((t) => !!t.snapshot?.live && Date.now() - Number(t.snapshot.live.at) < LIVE_FOR_MS);
    const g = groups.state();
    const groupsKey = g.rooms.map((r) => [r.id, r.lastAt, r.unread, r.wall, (g.messages[r.id] ?? []).map((m) => [m.id, m.editedAt ?? 0, !!m.deleted])]);
    const key = JSON.stringify([groupsKey, g.error, rows.threads.map((t) => [t.item, t.updated_at]), fresh, links.size, rows.commands.map((c) => [c.id, c.taken_at, c.claimed_by ?? null]), rows.projects, settingsRows, error, client.signedIn(), phoneStatusLine({ error, fetchedAt, macSeen: macSeenOf(rows.projects), cloud: cloudCarriesOn(rows.projects) })]);
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

  const sender = phoneSender({ client: {
    generation: () => client.generation(),
    update: (table, query, patch) => client.update(table, query, patch),
    insertCommand: async (row) => {
      if (row.kind === 'new' || row.kind === 'reply') {
        await readPlan();
        const w = settingsRows.find(r => r.device === row.device)?.settings?.workspace;
        const payload = row.payload as { engine?: string; model?: string | null };
        const thread = rows.threads.find(t => t.device === row.device && t.project === row.project && t.item === row.item)?.snapshot?.item;
        const engine = payload.engine ?? (w?.engines?.length === 1 ? w.engines[0] : thread?.engine);
        const why = phoneModelRefusal(w, { ...thread, ...payload, engine });
        if (why) throw new Error(why);
      }
      return client.insertCommand(row);
    },
  }, rows: () => rows, setRows: (next) => { rows = next; }, aliases: () => aliases, changed: () => changed(null) });

  // THE COMPUTER'S SETTINGS (web-settings.ts): its copy, read while Settings is
  // open, and the changes left for it, shown as waiting until it takes them.
  let settingCommands: PhoneRows['commands'] = [];
  const sentSettings: PhoneRows['commands'] = [];
  const failedSettings = (error: string) => ({ ...webSettingsModel(settingsRows, settingCommands, sentSettings, rows.projects), ok: false as const, error });
  async function readWebSettings() {
    await boot;
    if (!client.signedIn()) return webSettingsModel([], [], []);
    try {
      [settingsRows, settingCommands] = await Promise.all([readSettingsRows((table, query) => client.select(table, query)), commands()]);
    } catch (err) { return failedSettings(String((err as Error)?.message ?? err)); }
    return webSettingsModel(settingsRows, settingCommands, sentSettings, rows.projects);
  }
  // THE AGENTS To OFFERS come off the same copy (w-24119e8784), so it is read
  // once she is signed in, not only while Settings is open, and again every few
  // minutes; the card is told when what it offers changed.
  let agentsReadAt = -Infinity;
  let agentsKey = JSON.stringify(computerAgents(null));
  const readAgents = () => {
    if (!client.signedIn() || Date.now() - agentsReadAt < AGENTS_EVERY_MS) return;
    agentsReadAt = Date.now();
    void readWebSettings().then(() => {
      const key = JSON.stringify(computerAgents(computerOf(settingsRows)));
      if (key === agentsKey) return;
      agentsKey = key;
      window.dispatchEvent(new Event('agent-models-changed'));
      changed(null);
    });
  };
  async function changeSetting(change: Change) {
    const out = webSettingChange(computerOf(settingsRows), change);
    if (!out.ok) return failedSettings(out.error);
    const row = { id: crypto.randomUUID(), ...out.row };
    try {
      const made = await client.insertCommand(row);
      sentSettings.push({ created_at: new Date().toISOString(), claimed_at: null, taken_at: null, outcome: null, ...row, ...made });
    } catch (err) { return failedSettings(String((err as Error)?.message ?? err)); }
    return readWebSettings();
  }
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

  Object.assign(bridge, EMPTY_READS, {
    async snapshot() {
      await boot;
      const view = phoneView(rows);
      aliases = view.aliases;
      readAgents();
      const g = groupsSnapshot({ settingsRows, session: client.session(), groups: groups.state() });
      return {
        alpha: g.alpha,
        products: view.products, items: view.items, phoneWaiting: view.waiting,
        phoneStatus: client.signedIn() ? phoneStatusLine({ error, fetchedAt, macSeen: macSeenOf(rows.projects), cloud: cloudCarriesOn(rows.projects) }) : null,
        phoneConnect: phoneConnectState({ signedIn: client.signedIn(), started, error, projects: rows.projects, email: client.session()?.user.email }),
        phoneAccount: client.signedIn() ? { email: client.session()?.user.email ?? null, seenAt: macSeenOf(rows.projects), cloud: cloudCarriesOn(rows.projects), build } : null,
        team: g.team ?? team(), agents: [], approvals: view.approvals,
        // What the computer says of each thread it has not started (w-24119e8784), so waiting reads Queued, not Nothing running.
        supervisor: { ...SUPERVISOR, running: view.running, queued: view.queued, runNow: view.runNow, signInNeeded: view.signInNeeded, atLimit: view.atLimit, stalled: view.stalled, shipping: view.shipping, paused: view.paused, productOrder: view.products.map((p) => p.slug) },
        // The coding agents the computer offers, from its settings copy, so To offers Codex there too.
        engines: phoneEngines(settingsRows, rows.projects, view.items), runsOn: null, restartNeeded: null, cloud: null,
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
    settingsRead: () => readWebSettings(),
    setWorkspaceSetting: (p: { key: string; value: unknown }) => changeSetting({ scope: 'workspace', key: p?.key, value: p?.value }),
    setProjectSetting: (p: { product: string; key: string; value: unknown }) => changeSetting({ scope: 'project', product: p?.product, key: p?.key, value: p?.value }),
    // Each computer's repeating tasks ride with its settings copy (phone-repeats.ts).
    repeats: async () => {
      await boot;
      if (!client.signedIn()) return [];
      try { settingsRows = await readSettingsRows((table, query) => client.select(table, query)); } catch { /* the last copy read stands */ }
      return phoneRepeats(settingsRows, rows.commands, rows.projects);
    },
    // The screens draw Groups from the snapshot, so it is read again after each answer.
    rooms: (p: { op: string; args?: unknown[] }) => groups.door(p).finally(() => changed(null)),
    // Her Mac runs the agents; nothing here asks her to set one up.
    engineSetup: async () => ({ ok: true, phase: 'ready', found: true, signedIn: true }),
    dashboard: async () => null,
    codeChange: async () => ({ ok: false }),
    // What a press leaves for her Mac, the same doors the phone app sends through (phone-send.ts).
    ...sender,
    sendFeedback: (p: { text: string; files: FeedbackFiles }) => sendPhoneFeedback(cfg, p),
    badge: async (count: unknown) => { setIconCount(Number(count) || 0); return null; },
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
      client.signOut(); rows = EMPTY_ROWS; error = null; threadCache.clear(); groups.forget();
      places = new Map(); links.clear(); planReadAt = -Infinity; setDictationAllowed(false);
      for (const key of [...pages.keys()]) dropPage(key);
      changed(null);
      return { ok: true };
    },
    // A picture in a reply goes to her storage first (phone-sends-files.ts).
    saveAttachments: async ({ product, files }: { product: string; files: Array<{ name: string; dataBase64?: string }> }) => {
      const where = splitSlug(product);
      const owner = client.session()?.user.id;
      if (!where || !owner) throw new Error(NOT_HERE);
      const sent = await sendFiles({ put: (object, bytes, type) => client.putFile(BUCKET, object, bytes, type), owner, device: where.device, files, maxBytes: SEND_MAX_BYTES });
      // Drawn from the bytes just sent until the next read signs its link;
      // `until: 0` is what asks for that link.
      sent.forEach((s, i) => {
        const name = sentFileName(s.rel);
        const data = files[i]?.dataBase64;
        if (!name || !data || links.has(name)) return;
        links.set(name, { url: URL.createObjectURL(new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))])), until: 0 });
      });
      pictureLinksChanged();
      return sent;
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
  // A tapped alert opens its thread, as on the desktop.
  startPhoneAlerts(alertsVia, (id) => {
    const set = listeners.get(PUSH_CHANNELS.onOpenItem);
    if (!set?.size) return false;
    for (const fn of set) { try { fn({ id }); } catch { /* its own fault */ } }
    return true;
  });
  return true;
}

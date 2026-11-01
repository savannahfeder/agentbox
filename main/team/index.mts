// THE TEAM SERVICE: who is signed in on this Mac, their team, and the sync
// that keeps shared projects the same on every teammate's Mac.
//
// It owns one session (Supabase in the app, memory in tests) and, once someone
// is signed in:
//   - stamps every ledger line this Mac writes with their person id, here and
//     in the store server the supervisor starts (AGENTBOX_PERSON_ID);
//   - shows them the invites waiting for their email, and joins one only when
//     they say yes (acceptInvite). Once this Mac is in a team it stays in that
//     team: an invite, or an older team somebody made, never moves it;
//   - syncs every few seconds, and at once when a teammate writes;
//   - answers the window's questions: who am I, who is on my team, what are
//     my teammates' private tasks doing.
import path from 'node:path';
import { createTeamSync, fileSyncState } from './sync.mts';
import { listSharedProjects, joinSharedProject, markShared, makeDirect } from './projects.mts';
import type { TeamRecord } from './projects.mts';
import type { SyncBackend, SyncCard, SyncDisk, SyncReport, SyncState } from './sync.mts';
import type { AttachmentFile } from '../save-attachments.mts';
import type { PersonStatus } from '../../shared/team-status.mjs';
import { firstSentence } from '../../shared/thread-cards.mjs';
import { cardsFor } from '../../shared/thread-cards.mjs';
import fs from 'node:fs';
import { saveAttachments, attachmentMarkdown } from '../save-attachments.mts';
import { hasLapsed, statusEnds } from '../../shared/team-status.mjs';
import QRCode from 'qrcode';
import { createPhoneInbox } from '../phone-inbox.mts';
import type { PhoneBackendCalls, PhoneHistoryLine, PhoneInboxOptions, PhoneItem } from '../phone-inbox.mts';
import { PHONE_UNDO_HOLD_MS } from '../../shared/phone-undo.mjs';
import { SNAPSHOT_LIMITS, phoneProjectsOf, phoneEligible } from '../../shared/phone-snapshot.mjs';
import { createRooms } from './rooms.mts';
import type { RoomsBackend, RoomsOptions, RoomsState } from './rooms.mts';

export interface TeamPerson {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string | null;
  status?: PersonStatus | null;
  role?: string;
}
export interface TeamRef { id: string; name: string }
export interface TeamInvite { teamId: string; teamName: string; invitedBy: string | null; invitedByName: string | null }
export interface TeamSentInvite { email: string; invitedBy: string | null }

/** What the window is told about the team. */
export interface TeamState {
  configured: boolean;
  canSignIn: boolean;
  started: boolean;
  settling: boolean;
  signedIn: boolean;
  signingIn: { url: string } | null;
  me: TeamPerson | null;
  team: TeamRef | null;
  invites: TeamInvite[];
  sent: TeamSentInvite[];
  people: TeamPerson[];
  cards: SyncCard[];
  lastSyncAt: number | null;
  error: string | null;
  phoneSite?: string | null;
  phoneSiteQr?: string | null;
  phoneError?: string | null;
  phoneSentAt?: number | null;
  since?: number | null;
  confirm?: boolean;
  rooms?: RoomsState;
}

/** The signed-in cloud, as far as the team service asks of it: the real one and the memory one both answer. */
export type TeamBackend = Omit<SyncBackend, 'me' | 'personId'> & RoomsBackend & PhoneBackendCalls & {
  me(): Promise<TeamPerson | null | undefined>;
  setStatus(status: { text: unknown; until: number | null }): Promise<PersonStatus | null>;
  myTeams(): Promise<TeamRef[]>;
  teamPeople(teamId: string): Promise<TeamPerson[]>;
  listCards(): Promise<SyncCard[]>;
  pendingInvites(): Promise<TeamInvite[]>;
  listInvites?(teamId: string): Promise<TeamSentInvite[]>;
  createTeam(name: string): Promise<TeamRef>;
  renameTeam(teamId: string, name: string): Promise<unknown>;
  removeMember(teamId: string, personId: string): Promise<void>;
  cancelInvite(teamId: string, email: string): Promise<void>;
  acceptInvite(teamId: string): Promise<unknown>;
  invite(teamId: string, email: string): Promise<void>;
  shareProject(project: { id: string; teamId: string; name: string; visibility?: string; people?: string[]; direct?: boolean }): Promise<unknown>;
  subscribe(onChange: () => void): () => void;
};

/** The sign-in side: Supabase in the app, memory in tests. */
export interface TeamSession {
  configured?: boolean;
  restore(): Promise<TeamBackend | null | undefined>;
  signIn(options: { onUrl: (url: string) => void; log: (line: string) => void }): Promise<TeamBackend>;
  reopen?(url: string): Promise<unknown>;
  cancelSignIn?(): boolean;
  signInWithPassword?(email: string, password: string): Promise<TeamBackend>;
  signUp?(account: { email: string; password: string; name: string }): Promise<{ backend?: TeamBackend; confirm?: boolean } | null | undefined>;
  signOut?(): Promise<unknown>;
}

/** A project as the team service reads it from the store. */
export interface TeamProduct {
  slug: string;
  name: string;
  dir: string;
  repoPath?: string | null;
  team?: TeamRecord | null;
}

/** A row of the store, as far as the team service reads it. */
export interface TeamItem {
  id: string;
  product: string;
  agent?: unknown;
  updatedAt?: number;
}

export interface TeamStore {
  listProducts(opts?: { includeArchived?: boolean }): TeamProduct[];
  listItems(): TeamItem[];
  readItem(slug: string, id: string): unknown;
  readHistory(slug: string, id: string, opts?: { max?: number }): (PhoneHistoryLine | null)[];
  answerItem(slug: string, id: string, patch: { answer: string }): unknown;
  teamPatch(slug: string, id: string, patch: { assignee: string }): unknown;
  composeItem(slug: string, fields: Record<string, unknown>): unknown;
}

export interface TeamDisk extends SyncDisk {
  setLineAuthor(personId: string | null): void;
  readWorkItems(dir: string): PhoneItem[];
}

/** What the phone side of the service is given; the rest of it passes straight to the phone inbox. */
export interface TeamPhone {
  site?: string | null;
  ready?: () => boolean;
  device?: () => string | null;
  projects: () => unknown;
  apply: PhoneInboxOptions['apply'];
  waits?: PhoneInboxOptions['waitsOf'];
  live?: PhoneInboxOptions['liveOf'];
  approvals?: PhoneInboxOptions['approvalsOf'];
  readSettings?: PhoneInboxOptions['readSettings'];
  pins?: PhoneInboxOptions['pinsOf'];
  repeats?: PhoneInboxOptions['repeatsOf'];
  teammates?: PhoneInboxOptions['teammatesOf'];
  version?: string;
  idleMs?: PhoneInboxOptions['idleMs'];
  carrying?: PhoneInboxOptions['carrying'];
  kitsFor?: PhoneInboxOptions['kitsFor'];
  adopt?: PhoneInboxOptions['adopt'];
  cloudReplies?: PhoneInboxOptions['cloudReplies'];
  runHome?: PhoneInboxOptions['runHome'];
  newThreadKits?: PhoneInboxOptions['newThreadKits'];
  adoptNew?: PhoneInboxOptions['adoptNew'];
  asleep?: PhoneInboxOptions['asleep'];
  toCarry?: PhoneInboxOptions['toCarry'];
  handedOver?: PhoneInboxOptions['handedOver'];
  takenBack?: PhoneInboxOptions['takenBack'];
  carriedFinished?: PhoneInboxOptions['carriedFinished'];
  stateFile: string;
}

export type TeamRoomsSetup = Pick<RoomsOptions, 'enabled' | 'device' | 'presenceFacts' | 'prefsFile'>;

export interface TeamServiceOptions {
  session?: TeamSession | null;
  store: TeamStore;
  disk: TeamDisk;
  accountRoot: string;
  stateFile: string;
  onChange?: () => void;
  log?: (line: string) => void;
  intervalMs?: number;
  startRetryMs?: number;
  now?: () => number;
  phone?: TeamPhone | null;
  rooms?: TeamRoomsSetup | null;
}

// `signingIn` is { url } while a Google sign-in waits on the browser, so the
// page can offer that link again rather than a button that does nothing.
const EMPTY: TeamState = { configured: false, canSignIn: false, started: false, settling: false, signedIn: false, signingIn: null, me: null, team: null, invites: [], sent: [], people: [], cards: [], lastSyncAt: null, error: null };

// With Alpha features › Multiplayer off the window gets the sign-in the phone
// needs and no team, so it draws the single-person app.
export function teamForWindow(state: TeamState | null | undefined, multiplayer: boolean) {
  if (multiplayer || !state) return state;
  const { rooms, ...rest } = state;
  return { ...rest, configured: false, team: null, invites: [], sent: [], people: [], cards: [] };
}

export function createTeamService({
  session, store, disk, accountRoot, stateFile, onChange = () => {}, log = () => {}, intervalMs = 5000, startRetryMs = 1500,
  // The clock, so a test can move past the moment a status runs out.
  now = Date.now,
  // HER PHONE WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1): which
  // projects she put on it (slugs), how a command from it is done, and where
  // this Mac remembers what it sent. Needs no team, only a sign-in.
  phone = null,
  // ROOMS (alpha, docs/team/ROOMS-PLAN.md): { enabled, device, presenceFacts, prefsFile }.
  rooms: roomsSetup = null,
}: TeamServiceOptions) {
  // The phone site's address, only an https one, and its code for Settings.
  const site = typeof phone?.site === 'string' && /^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(phone.site) ? phone.site : null;
  let siteQr: string | null = null;
  // `settling` holds the window's boot screen until the team is known, so it
  // never draws the single-person app first and then redraws with the team.
  // `canSignIn` survives teamForWindow, so a build with Multiplayer off still asks.
  let state: TeamState = { ...EMPTY, configured: !!session?.configured, canSignIn: !!session?.configured, settling: !!session?.configured, phoneSite: site, phoneSiteQr: null };
  let backend: TeamBackend | null = null;
  let sync: ReturnType<typeof createTeamSync> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let pending: Promise<SyncReport | null> | null = null;
  let phoneInbox: ReturnType<typeof createPhoneInbox> | null = null;
  // The sync cursors and which team this Mac is in, in one file.
  let local: SyncState | null = null;
  const kept = () => (local ??= fileSyncState(stateFile, fs));

  const set = (patch: Partial<TeamState>) => { state = { ...state, ...patch }; onChange(); };
  const rooms = roomsSetup ? createRooms({
    backend: () => backend, me: () => state.me, team: () => state, now, log, onChange, ...roomsSetup,
  }) : null;
  if (site) QRCode.toString(site, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((qr) => { siteQr = qr; set({ phoneSiteQr: qr }); }).catch(() => {});

  function products() {
    try { return store.listProducts(); } catch { return []; }
  }

  // A status the owner set has run out: wipe it where it is stored, so old
  // text does not sit in the cloud. Everyone who READS it already saw it go,
  // on their own clock (shared/team-status.mjs); this is the tidying.
  async function clearLapsedStatus() {
    if (!backend || !hasLapsed(state.me?.status, now())) return;
    await backend.setStatus({ text: null, until: null });
    set({ me: { ...state.me!, status: null } });
  }

  // THE MESSAGE RECORD OF EXACTLY TWO PEOPLE, made by one of them (see
  // `message` below for why both halves matter).
  // `to` is one person or several (2026-10-01: messages to a few people at
  // once). The record must hold EXACTLY you and them, and one of you made it.
  function directWith(me: string, to: string | string[]) {
    const two = new Set<string | null>([me, ...([] as string[]).concat(to)]);
    const justUs = (t: TeamRecord) => {
      const on = new Set([...t.people, ...(t.sharedBy ? [t.sharedBy] : [])]);
      return two.has(t.sharedBy) && on.size === two.size && [...on].every((p) => two.has(p));
    };
    // ONE RECORD FOR THE TWO OF YOU, THE SAME ONE ON BOTH MACS. Two people who
    // write each other first within the same second each make one (measured
    // 2026-10-01 on two test copies), and each Mac then kept writing into its
    // own. Both now settle on the record with the lowest id, so the talk
    // comes back together the moment both records are known.
    return products().filter((p) => p.team?.direct && justUs(p.team))
      .sort((a, b) => String(a.team!.projectId).localeCompare(String(b.team!.projectId)))[0] ?? null;
  }

  // THE CONVERSATION IN A MESSAGE RECORD: its most recently touched row. Older
  // records may hold one row per message, from before a message continued the
  // conversation, and the newest of those is where the talk is.
  function conversationIn(slug: string) {
    let rows: TeamItem[] = [];
    try { rows = store.listItems().filter((i) => i.product === slug && !i.agent); } catch { rows = []; }
    return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
  }

  // THE TEAM THIS MAC IS IN IS THE ONE IT REMEMBERS. Found by review
  // 2026-10-01: the app took whichever of your teams was oldest, and joined
  // every team that invited you at each start, so a team made with a
  // backdated created_at and an invite moved your work into it unasked. Now
  // the first team is remembered, and a remembered team you are no longer on
  // leaves you in no team rather than in another one.
  async function refreshTeam() {
    const me = state.me?.id;
    const teams = await backend!.myTeams();
    const remembered = me ? kept().getTeam(me) : null;
    // '' is "left a team, and joins nothing until asked": never quietly the next one.
    const team = remembered === '' ? null : remembered ? teams.find((t) => t.id === remembered) ?? null : teams[0] ?? null;
    if (team && !remembered && me) kept().setTeam(me, team.id);
    // The moment sharing starts on this Mac, kept so it never moves later.
    if (team && me && !kept().getSince(me)) kept().setSince(me, Date.now());
    const people = team ? await backend!.teamPeople(team.id) : [];
    const cards = team ? await backend!.listCards() : [];
    // An invite lookup that fails (an older cloud, a dropped request) leaves
    // you signed in with nothing offered, never signed out.
    const invites = team ? [] : await backend!.pendingInvites().catch((err) => { log(`team: invites: ${err.message}`); return []; });
    // The invites this team has out, so the settings page can say who has not
    // joined yet and let them be cancelled.
    const sent = team && backend!.listInvites ? await backend!.listInvites(team.id).catch(() => []) : [];
    set({ team, people, cards, invites, sent, since: me ? kept().getSince(me) : null });
  }

  async function syncNow() {
    if (!sync) return null;
    if (pending) return pending;
    // THE BODY WAITS A MICROTASK, SO `pending` IS SET BEFORE ANY OF IT RUNS.
    // Written as `pending = (async () => {...})()` the body's synchronous
    // prefix runs BEFORE the assignment, so `pending` was still null while it
    // ran. That was harmless until a pass wrote to the cloud: clearing a
    // lapsed status makes the memory cloud emit, the emit calls back into
    // syncNow, the guard is still null, and it recurses until the stack ends.
    // Measured on the first run of the lapse test: a stack overflow, every
    // frame this function.
    pending = Promise.resolve().then(async () => {
      try {
        // An invite sent after this person signed in shows up here, not at
        // their next sign-in. It is offered, never taken up.
        if (!state.team) await refreshTeam();
        await clearLapsedStatus();
        const report = await sync!.syncOnce();
        // The people are read again on every pass, with the activity, so a
        // teammate who joined after this Mac signed in has a name and a face
        // on the first line of theirs that arrives here.
        const [cards, people, me] = state.team
          ? await Promise.all([backend!.listCards(), backend!.teamPeople(state.team.id), backend!.me()])
          : [[], [], state.me];
        set({ lastSyncAt: Date.now(), error: null, cards, people, me: me ?? state.me });
        if (report.joined.length || report.pulled) log(`team: joined ${report.joined.length}, pulled ${report.pulled}, pushed ${report.pushed}`);
        if (report.notJoined) log(`team: left ${report.notJoined} shared project(s) unjoined, this computer already holds the most it takes on by itself`);
        return report;
      } catch (err) {
        set({ error: String((err as Error | undefined)?.message ?? err) });
        return null;
      } finally {
        // On its own, so a team sync that failed does not hold up her phone,
        // nor her phone the team.
        await phoneOnce();
        await rooms?.tick().catch((err) => log(`rooms: ${err.message}`));
        pending = null;
      }
    });
    return pending;
  }

  async function phoneOnce() {
    // Not before the app's handlers exist: a command taken then would be
    // marked refused for no reason of hers.
    if (!phoneInbox || phone!.ready?.() === false) return;
    try {
      await phoneInbox.syncOnce();
      // Told to the window only when it changes, not on every five-second pass.
      if (state.phoneError || !state.phoneSentAt) set({ phoneError: null, phoneSentAt: now() });
      else state.phoneSentAt = now();
    } catch (err) {
      const said = String((err as Error | undefined)?.message ?? err);
      if (state.phoneError !== said) set({ phoneError: said });
    }
  }

  function makePhoneInbox() {
    if (!phone) return null;
    const productOf = (slug: string) => products().find((p) => p.slug === slug) ?? null;
    // WHO IT SENDS AS, fixed now, and whether that is still who is signed in
    // (Codex's second review, finding 1).
    const owner = state.me?.id;
    const signedInAs = backend;
    if (!owner) return null;
    let inbox: ReturnType<typeof createPhoneInbox> | null = null;
    inbox = createPhoneInbox({
      backend: backend!,
      owner,
      undoHoldMs: PHONE_UNDO_HOLD_MS,
      alive: () => phoneInbox === inbox && backend === signedInAs && state.me?.id === owner,
      device: phone.device?.() ?? null,
      projects: () => {
        const on = new Set(phoneProjectsOf(phone.projects(), owner, phoneEligible(products())));
        return products().filter((p) => on.has(p.slug)).map((p) => ({ slug: p.slug, name: p.name || p.slug, dir: p.dir || null, repoPath: p.repoPath || null }));
      },
      listItems: (slug) => { const p = productOf(slug); try { return p ? disk.readWorkItems(p.dir) : []; } catch { return []; } },
      historyOf: (slug, id, { all = false }: { all?: boolean } = {}) => { try { return store.readHistory(slug, id, { max: all ? Number.MAX_SAFE_INTEGER : SNAPSHOT_LIMITS.lines * 4 }); } catch { return []; } },
      apply: phone.apply,
      waitsOf: () => phone.waits?.() ?? null,
      liveOf: (slug, id) => phone.live?.(slug, id) ?? null,
      approvalsOf: () => phone.approvals?.() ?? [],
      readSettings: phone.readSettings ?? null,
      pinsOf: () => phone.pins?.() ?? {},
      repeatsOf: phone.repeats ?? null,
      teammatesOf: phone.teammates ?? null,
      version: phone.version ?? '',
      idleMs: phone.idleMs ?? null,
      // The lid shut: projects whose threads carry on in the cloud, and runs it started (shared/cloud-kit.mjs).
      carrying: phone.carrying ?? null,
      kitsFor: phone.kitsFor ?? null,
      adopt: phone.adopt ?? null,
      cloudReplies: phone.cloudReplies ?? null,
      runHome: phone.runHome ?? null,
      newThreadKits: phone.newThreadKits ?? null,
      adoptNew: phone.adoptNew ?? null,
      asleep: phone.asleep ?? (() => false),
      toCarry: phone.toCarry ?? null,
      handedOver: phone.handedOver ?? (() => {}),
      takenBack: phone.takenBack ?? (() => {}),
      carriedFinished: phone.carriedFinished ?? (() => {}),
      // One file per person: what this Mac sent up for one account is not
      // what the next one to sign in here has.
      stateFile: phone.stateFile.replace(/(\.json)?$/, `.${owner}.json`),
      now,
      log,
    });
    return inbox;
  }

  function stopLoop() {
    if (timer) clearInterval(timer);
    timer = null;
    unsubscribe?.();
    unsubscribe = null;
  }

  async function signedIn(b: TeamBackend) {
    backend = b;
    const me = await backend.me();
    if (!me) throw new Error('signed in, but no person record came back');
    disk.setLineAuthor(me.id);
    process.env.AGENTBOX_PERSON_ID = me.id;
    set({ signedIn: true, me, error: null });
    // MY WORKSPACE IS NOT MADE HERE ANY MORE (w-f8d123be62, approved
    // 2026-10-05). It was, and that was the whole bug: the only caller was this
    // one, inside signing in, and this service is not even built on a Mac with
    // no team cloud. So the single-person app opened on no projects at all.
    // Everybody gets one at boot now (main/main.mts), signed in or not.
    await refreshTeam();
    if (state.settling) set({ settling: false });
    phoneInbox = makePhoneInbox();
    sync = createTeamSync({
      backend,
      disk,
      log,
      state: kept(),
      // ARCHIVED ONES COUNT AS HERE. Asked of the visible list, a shared
      // project you archived read as missing and was joined again beside it.
      listShared: () => { try { return listSharedProjects(store.listProducts({ includeArchived: true })); } catch { return []; } },
      joinProject: (project) => joinSharedProject(accountRoot, project),
      listCards: () => cardsFor({ products: products(), readItems: (p) => disk.readWorkItems(p.dir), since: state.me ? kept().getSince(state.me.id) : null }),
      teamIdOf: () => state.team?.id ?? null,
    });
    stopLoop();
    timer = setInterval(() => { syncNow(); }, intervalMs);
    timer.unref?.();
    unsubscribe = backend.subscribe(() => { syncNow(); });
    await syncNow();
  }

  return {
    state: () => (rooms ? { ...state, rooms: rooms.state() } : state),
    rooms,
    /** What the desktop's banner was told arrived, for her phone's alerts (main/phone-alerts.mjs). */
    phoneArrivals: (list: unknown[], needsYou: unknown[]) => phoneInbox?.arrivals(list, needsYou),

    // THREE TRIES AT START, because one dropped request left the app signed
    // out until it was restarted (measured 2026-10-01 on a loaded Mac: the
    // sign-in went through and the very next call failed). A session that is
    // simply not there is not an error and is not retried.
    // `started` says the first look for a saved sign-in is over, so the window
    // can tell "signed out" from "still finding out" and never flashes the
    // sign-in page at somebody who is signed in.
    async start() {
      if (!session?.configured) return state;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const b = await session.restore();
          if (b) await signedIn(b);
          set({ started: true, settling: false });
          return state;
        } catch (err) {
          set({ error: String((err as Error | undefined)?.message ?? err), settling: false });
          if (attempt < 2) await new Promise((r) => setTimeout(r, startRetryMs * (attempt + 1)));
        }
      }
      set({ started: true });
      return state;
    },

    async signIn() {
      let b: TeamBackend;
      try {
        b = await session!.signIn({ onUrl: (url) => set({ signingIn: { url } }), log });
      } finally {
        if (state.signingIn) set({ signingIn: null });
      }
      await signedIn(b);
      return state;
    },

    /** Open the waiting Google sign-in's own link again. False if none waits. */
    async reopenSignIn() {
      const url = state.signingIn?.url;
      if (!url || !session?.reopen) return false;
      log('team: Google sign-in: opening the browser again');
      await session.reopen(url);
      return true;
    },

    cancelSignIn() {
      return session?.cancelSignIn?.() ?? false;
    },

    async signInWithEmail(email: string, password: string) {
      if (!session?.signInWithPassword) throw new Error('this build cannot sign in with email');
      const b = await session.signInWithPassword(email, password);
      await signedIn(b);
      return state;
    },

    /** A new account: signed in at once, or { confirm: true } until the email is confirmed. */
    async signUp(email: string, password: string, name: string) {
      if (!session?.signUp) throw new Error('this build cannot make accounts');
      const out = await session.signUp({ email, password, name });
      if (out?.backend) { await signedIn(out.backend); return state; }
      return { ...state, confirm: true };
    },

    async signOut() {
      stopLoop();
      // While still signed in, so this Mac can say it has gone.
      await rooms?.stop().catch(() => {});
      await session!.signOut?.();
      disk.setLineAuthor(null);
      delete process.env.AGENTBOX_PERSON_ID;
      backend = null;
      sync = null;
      phoneInbox = null;
      // Signed out is a known answer, so the window shows the sign-in page at once.
      state = { ...EMPTY, configured: !!session?.configured, started: true, phoneSite: site, phoneSiteQr: siteQr };
      onChange();
      return state;
    },

    async createTeam(name: unknown) {
      if (!backend) throw new Error('sign in first');
      const clean = String(name ?? '').trim();
      if (!clean) throw new Error('a team needs a name');
      const made = await backend.createTeam(clean);
      kept().setTeam(state.me!.id, made.id);
      await refreshTeam();
      return state;
    },

    // TEAM SETTINGS (2026-10-01): an invite page and team settings beside it.
    // The database decides who may (owners rename,
    // remove and cancel; anyone leaves); these only ask it and say what it said.
    async renameTeam(name: unknown) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      const clean = String(name ?? '').trim();
      if (!clean) throw new Error('a team needs a name');
      await backend.renameTeam(state.team.id, clean);
      await refreshTeam();
      return state;
    },

    // A line you write about yourself, held until the end of today, tomorrow
    // or this week, or until you clear it. Saying nothing clears it.
    async setStatus({ text, hold = 'open', until }: { text?: unknown; hold?: string; until?: number } = {}) {
      if (!backend) throw new Error('sign in first');
      const status = await backend.setStatus({ text, until: statusEnds({ hold, until }, now()) });
      set({ me: { ...state.me!, status } });
      return state;
    },

    async removeMember(personId: string) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      if (personId === state.me?.id) throw new Error('to leave the team, use Leave team');
      await backend.removeMember(state.team.id, personId);
      await refreshTeam();
      return state;
    },

    async leaveTeam() {
      if (!backend || !state.team || !state.me) throw new Error('you are not on a team');
      await backend.removeMember(state.team.id, state.me.id);
      kept().setTeam(state.me.id, '');
      await refreshTeam();
      return state;
    },

    async cancelInvite(email: string) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      await backend.cancelInvite(state.team.id, email);
      await refreshTeam();
      return state;
    },

    // JOIN A TEAM BECAUSE ITS INVITE WAS ANSWERED YES, and only then. A Mac
    // already in a team does not move: that is a choice nobody offers here.
    async acceptInvite(teamId: string) {
      if (!backend || !state.me) throw new Error('sign in first');
      if (state.team) throw new Error(`this computer is already in ${state.team.name}`);
      if (!state.invites.some((i) => i.teamId === teamId)) throw new Error('that invite is no longer waiting');
      await backend.acceptInvite(teamId);
      kept().setTeam(state.me.id, teamId);
      await refreshTeam();
      await syncNow();
      return state;
    },

    async invite(email: unknown) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      const clean = String(email ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error(`${clean || 'that'} is not an email address`);
      await backend.invite(state.team.id, clean);
      // So the settings page lists it as invited straight away.
      await refreshTeam().catch(() => {});
      return state;
    },

    // Share a local project with the whole team or with specific people. The
    // project keeps one cloud id for good (markShared), so changing who sees
    // it is the same project.
    async share(slug: string, { visibility = 'team', people = [] }: { visibility?: string; people?: string[] } = {}) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      const product = products().find((p) => p.slug === slug);
      if (!product) throw new Error(`no project ${slug}`);
      const team = markShared(product.dir, { teamId: state.team.id, visibility, people, sharedBy: state.me!.id })!;
      await backend.shareProject({ id: team.projectId, teamId: state.team.id, name: product.name, visibility: team.visibility, people: team.people });
      onChange();
      await syncNow();
      return state;
    },

    // A MESSAGE TO A PERSON (approved 2026-10-01: people get messages, never
    // tasks). It goes into the record the two of them share, made the first
    // time and reused after, and it waits in their inbox until they answer.
    /** The conversation in a message record: its newest row, if it has one. */
    conversation(to: string | string[] | null | undefined) {
      const me = state.me?.id;
      if (!me || !to) return null;
      const product = directWith(me, to);
      const convo = product ? conversationIn(product.slug) : null;
      return convo ? { product: product.slug, id: convo.id } : null;
    },

    /**
     * `priority` is the level the sender picked on the card, and it counts on
     * the FIRST message only (w-7ba439c883): the conversation's place in the
     * other person's inbox was settled when it opened, and a reply three days
     * later is not a chance to lift it. Nothing picked means nothing sent, so
     * the row keeps composeItem's 0, which the inbox reads as Medium.
     */
    async message(toIn: string | string[] | null | undefined, body: unknown, priority?: number | null, files: AttachmentFile[] = []) {
      if (!backend || !state.team || !state.me) throw new Error('start or join a team first');
      const me = state.me.id;
      // One person or a few: the same conversation for the same people.
      const others = [...new Set(([] as string[]).concat(toIn ?? []).filter((p) => p && p !== me))].sort();
      if (!others.length) throw new Error('pick someone to message');
      if (others.length > 11) throw new Error('a message goes to at most eleven people');
      if (others.some((p) => !state.people.some((q) => q.id === p))) throw new Error('that person is not on your team');
      const to = others.length === 1 ? others[0] : others;
      const words = String(body ?? '').trim();
      const carried = (Array.isArray(files) ? files : []).filter((f) => f && (f.dataBase64 || f.srcPath));
      if (!words && !carried.length) throw new Error('a message needs some words');
      // THE RECORD IS REUSED ONLY IF IT IS EXACTLY THE TWO OF YOU AND ONE OF
      // YOU MADE IT. Found by review 2026-10-01: a teammate could make a
      // "direct" record holding you and somebody else, and the next message
      // either of you sent the other went into it, where its maker read it.
      let product: Pick<TeamProduct, 'slug' | 'dir'> | null = directWith(me, to);
      // Before making a record, look once more: the other person may have just
      // made one, and the pull is what brings it here.
      if (!product) { await syncNow(); product = directWith(me, to); }
      if (!product) {
        const made = makeDirect(accountRoot, { teamId: state.team.id, me, others });
        // A START THAT FAILS LEAVES NOTHING BEHIND. A record shared only in
        // part (the cloud refused its people) was reused by the next send and
        // never reached anyone (found 2026-10-01 on a test copy).
        try {
          await backend.shareProject({ id: made.projectId, teamId: state.team.id, name: 'Direct', visibility: 'people', people: others, direct: true });
        } catch (err) {
          try { fs.rmSync(made.dir, { recursive: true, force: true }); } catch { /* the error below still says what failed */ }
          throw err;
        }
        product = products().find((p) => p.dir === made.dir) ?? { slug: made.slug, dir: made.dir };
      }
      // ITS FILES, saved into the conversation now that there is one, and
      // linked under the words the way the reply box links them. The sync
      // sends each one on before the line that names it (./sync.mts).
      const text = [words, attachmentMarkdown(saveAttachments(product.dir, carried))].filter(Boolean).join('\n\n');
      // ONE CONVERSATION PER PERSON (decided 2026-10-01 from user research:
      // people expect to click a name and see what was said before, and a
      // subject line on every message between two coworkers makes talking
      // feel like filing tickets). So a message goes on the end of the
      // conversation the two of you already have, reopened if it was put away,
      // and only the first message ever starts one. Work stays in threads; this
      // is talk.
      // Named by its words; a message that is only files is named by them.
      const title = firstSentence(words, 90) || words.slice(0, 90) || (carried.length === 1 ? String(carried[0].name ?? 'A file') : `${carried.length} files`);
      const convo = conversationIn(product.slug);
      if (convo) {
        store.answerItem(product.slug, convo.id, { answer: text });
        // Who answers next is whoever did not speak last (shared/team-rules.mjs,
        // `inMyInbox`); the assignee stays for a Mac on an older build.
        store.teamPatch(product.slug, convo.id, { assignee: others[0] });
        onChange();
        await syncNow();
        return store.readItem(product.slug, convo.id);
      }
      const level = Number.isFinite(priority) && priority! > 0 ? Math.trunc(priority!) : 0;
      const item = store.composeItem(product.slug, { title, body: text, priority: level, assignee: others[0], people: [me, ...others] });
      onChange();
      await syncNow();
      return item;
    },

    syncNow,
    stop: stopLoop,
  };
}

// Where the service keeps its sync cursors: beside the store's own records.
export function teamStateFile(storeRoot: string) {
  return path.join(storeRoot, '.team-sync.json');
}

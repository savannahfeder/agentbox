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
import { createTeamSync, fileSyncState, MAX_MESSAGE_FILE_BYTES } from './sync.mts';
import { createThreadShare as createThreadShareJs } from './thread-share.mjs';
import { briefToContinue } from './continue-thread.mjs';
import { CONTINUED_NOTE } from '../../shared/thread-continued.mjs';
import { findFileToSend as findFileToSendJs } from './carry-files.mjs';
import { readableSharedThreads } from '../everything-found.mjs';
import { plainRef } from '../../shared/carried-files.mjs';
import { listSharedProjects, joinSharedProject, markShared, makeDirect } from './projects.mts';
import type { TeamRecord } from './projects.mts';
import type { SyncBackend, SyncCard, SyncDisk, SyncReport, SyncState } from './sync.mts';
import type { AttachmentFile, SavedAttachment } from '../save-attachments.mts';
import type { PersonStatus } from '../../shared/team-status.mjs';
import { GIVEN_TASK, WORK_THREAD, isTaskRow, isWorkThread, teamPeopleShown } from '../../shared/team-rules.mjs';
import { referencedFiles } from '../../shared/referenced-files.mts';
import { shortTitle } from '../../shared/thread-title.mjs';
import { taskTitle } from '../../shared/team-tasks.mjs';
import { firstSentence } from '../../shared/thread-cards.mjs';
import { cardsFor as cardsForJs } from '../../shared/thread-cards.mjs';
import fs from 'node:fs';
import { saveAttachments, attachmentMarkdown } from '../save-attachments.mts';
import { hasLapsed, statusEnds } from '../../shared/team-status.mjs';
import QRCode from 'qrcode';
import { createPhoneInbox } from '../phone-inbox.mts';
import type { PhoneBackendCalls, PhoneHistoryLine, PhoneInboxOptions, PhoneItem } from '../phone-inbox.mts';
import { PHONE_UNDO_HOLD_MS } from '../../shared/phone-undo.mjs';
import { SNAPSHOT_LIMITS, phoneProjectsOf, phoneEligible } from '../../shared/phone-snapshot.mjs';
import { createRooms } from './rooms.mts';
import { noticeEndedWaits as noticeEndedWaitsJs } from './waits.mjs';
import { handOverDepartures } from './departures.mjs';
import { mateCard as mateCardJs, splitCards as splitCardsJs } from '../../shared/mate-cards.mjs';
import type { RoomsBackend, RoomsOptions, RoomsState } from './rooms.mts';

export interface TeamPerson {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string | null;
  status?: PersonStatus | null;
  role?: string;
  connections?: string[];
}
/** Somebody else's AI teammate, as their card on the team's board describes it (shared/mate-cards.mjs). */
export interface TeamMate { id: string; owner: string; name?: string; job?: string | null; now?: unknown; open?: boolean; running?: boolean; updatedAt?: number }
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
  teamMates?: TeamMate[];
  sharedFileNews?: unknown[];
  /** `${slug}/${id}` then person: when they last opened that conversation. */
  seen?: Record<string, Record<string, number>>;
}

/** A person's open work and AI teammates, handed on when they leave. */
export interface TeamHandover { handTo: string; name: string; mates: { id: string; name?: string; job?: string | null; to: string | null }[] }

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
  removeMember(teamId: string, personId: string, handover?: TeamHandover | null): Promise<void>;
  departures?(teamId: string): Promise<unknown[]>;
  setConnections?(ids: unknown): Promise<unknown>;
  seenMarks?(): Promise<{ projectId: string; itemId: string; personId: string; at: number }[]>;
  markSeen?(projectId: string, itemId: string): Promise<unknown>;
  addThreadComment(owner: string, threadId: string, text: string): Promise<unknown>;
  fileFolders?(): Promise<unknown>;
  filePlaces?(): Promise<unknown>;
  putFileFolder?(teamId: string, row: unknown): Promise<unknown>;
  placeFile?(owner: string, threadId: string, row: unknown): Promise<unknown>;
  addFileVersion?(teamId: string, row: unknown): Promise<unknown>;
  fileVersions?(teamId: string): Promise<unknown>;
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
  practice?: boolean;
  personal?: boolean;
  team?: TeamRecord | null;
}

/** A row of the store, as far as the team service reads it. */
export interface TeamItem {
  id: string;
  product: string;
  agent?: unknown;
  updatedAt?: number;
  labels?: string[];
}

/** A row of the store as far as handing a thread on or moving a message reads it. */
export interface TeamRow {
  id: string;
  label?: string;
  title?: string;
  body?: string;
  result?: string;
  labels?: string[];
  status?: string;
  priority?: number;
  due?: unknown;
  edits?: Record<string, { gone?: boolean; text?: unknown } | undefined>;
  updatedAt?: number;
}

/** A line of a thread's ledger, as the team service reads it. */
export interface TeamHistoryLine extends PhoneHistoryLine { uid?: string; by?: string }

export interface TeamAnswer { answer: string; voice?: unknown; forAgent?: unknown; inReplyTo?: string; status?: string }

export interface TeamStore {
  listProducts(opts?: { includeArchived?: boolean }): TeamProduct[];
  listItems(): TeamItem[];
  readItem(slug: string, id: string): TeamRow | null;
  readThread(slug: string, id: string): { text?: string }[];
  readHistory(slug: string, id: string, opts?: { max?: number }): (TeamHistoryLine | null)[];
  answerItem(slug: string, id: string, patch: TeamAnswer): unknown;
  teamPatch(slug: string, id: string, patch: { assignee: string }): unknown;
  composeItem(slug: string, fields: Record<string, unknown>): { id: string };
  teammates?: { create(fields: { name?: string; job?: string | null; product?: string }): { id: string }; remember(id: string, text: unknown): unknown } | null;
  config?: { storeRoot?: string };
}

export interface TeamDisk extends SyncDisk {
  setLineAuthor(personId: string | null): void;
  readWorkItems(dir: string): PhoneItem[];
  updateWorkItem(dir: string, id: string, patch: Record<string, unknown>, opts?: { source?: string; now?: number }): unknown;
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
  /** Options for the file carrier of each conversation (tests make its waits short). */
  carrierOptions?: Record<string, unknown> | null;
  /** The threads an agent is on right now, by id, so a card says so. */
  runningIds?: () => string[];
  /** This person's AI teammates, which the team sees on its board. */
  ownMates?: () => { id: string; name?: string; job?: string | null; openToTeam?: boolean; now?: string | null; running?: boolean; updatedAt?: number; createdAt?: number }[];
  phone?: TeamPhone | null;
  rooms?: TeamRoomsSetup | null;
}

/** A file handed to a task; one with a `rel` is a file the words name. */
interface TaskFile extends AttachmentFile { rel?: string }

interface TaskInput {
  title?: unknown; body?: unknown; priority?: number | null; due?: unknown; files?: TaskFile[]; voice?: unknown;
  visibility?: unknown; visibleTo?: unknown[]; blockedBy?: unknown;
}

/** What rides along with a message: a voice note, the agent it is for, a subject that makes it its own thread. */
interface MessageExtras { voice?: unknown; forAgent?: unknown; subject?: unknown }

// The plain-JS helpers infer their `= null` defaults as `null`; these say what they are given.
const findFileToSend = findFileToSendJs as (args: { ref: string; meant?: boolean; conversation?: { dir: string; people: string[] }; products: TeamProduct[] }) => Promise<unknown>;
const splitCards = splitCardsJs as (all: SyncCard[], me?: string | null) => { cards: SyncCard[]; mates: TeamMate[] };
const cardsFor = cardsForJs as (p: { products: TeamProduct[]; readItems: (product: TeamProduct) => PhoneItem[]; now?: number; since?: number | null; me?: string | null; running?: string[] }) => SyncCard[];
const noticeEndedWaits = noticeEndedWaitsJs as (args: {
  products: TeamProduct[]; read: (product: TeamProduct) => PhoneItem[]; write: (dir: string, id: string, patch: Record<string, unknown>) => unknown;
  cards: SyncCard[]; nameOf: (id: string) => string; now: number; me?: string | null;
}) => unknown;

/** What the shared threads of teammates look like on this Mac (./thread-share.mjs). */
interface ThreadShare {
  pass(teamId: string | null | undefined): Promise<void>;
  read(owner: string, threadId: string): { shared: boolean; lines: unknown[]; earlier: number; product: string | null; dir: string | null };
  folders(): { ownerId: string; threadId: string; version: string }[];
  products(): { slug: string; name: string; dir: string }[];
  addMark(owner: string, threadId: string, mark: unknown): Promise<boolean>;
  fileNews(): unknown[];
  refreshComments(): Promise<void>;
}
const createThreadShare = createThreadShareJs as unknown as (args: {
  backend: TeamBackend; me: string; myName: () => string | null; root: string; listCards: () => SyncCard[];
  listThreads: () => Map<string, { item: PhoneItem; product: TeamProduct }>;
  historyOf: (slug: string, id: string) => (TeamHistoryLine | null)[];
  listProducts: () => TeamProduct[]; disk: TeamDisk; accountRoot: string; storeRoot?: string;
  onChange: () => void; log: (line: string) => void; now: () => number;
}) => ThreadShare;
const mateCard = mateCardJs as (t: { id: string; name?: string; job?: string | null; openToTeam?: boolean }, how?: { now?: string | null; at?: number; running?: boolean }) => SyncCard;

// `signingIn` is { url } while a Google sign-in waits on the browser, so the
// page can offer that link again rather than a button that does nothing.
const EMPTY: TeamState = { configured: false, canSignIn: false, started: false, settling: false, signedIn: false, signingIn: null, me: null, team: null, invites: [], sent: [], people: [], cards: [], lastSyncAt: null, error: null };

// With Alpha features › Multiplayer off the window gets the sign-in the phone
// needs and no team, so it draws the single-person app.
export function teamForWindow(state: TeamState | null | undefined, multiplayer: boolean) {
  if (multiplayer || !state) return state;
  const { rooms, ...rest } = state;
  return { ...rest, configured: false, team: null, invites: [], sent: [], people: [], cards: [], teamMates: [], sharedFileNews: [] };
}

export function createTeamService({
  session, store, disk, accountRoot, stateFile, onChange = () => {}, log = () => {}, intervalMs = 5000, startRetryMs = 1500,
  // The clock, so a test can move past the moment a status runs out.
  now = Date.now,
  // Options for the file carrier of each conversation (tests make its waits short).
  carrierOptions = null,
  // HER PHONE WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1): which
  // projects she put on it (slugs), how a command from it is done, and where
  // this Mac remembers what it sent. Needs no team, only a sign-in.
  phone = null,
  // ROOMS (alpha, docs/team/ROOMS-PLAN.md): { enabled, device, presenceFacts, prefsFile }.
  rooms: roomsSetup = null,
  // The threads an agent is on right now, by id, so a card says so.
  runningIds = () => [],
  // This person's AI teammates, which the team sees on its board.
  ownMates = () => [],
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
  let threadShare: ThreadShare | null = null;
  // The sync cursors and which team this Mac is in, in one file.
  let local: SyncState | null = null;
  const kept = () => (local ??= fileSyncState(stateFile, fs));

  const set = (patch: Partial<TeamState>) => { state = { ...state, ...patch }; onChange(); };
  // Threads go on as they always did; the others' AI teammates go beside them.
  const withCards = (all: SyncCard[] | null | undefined, rest: Partial<TeamState>): Partial<TeamState> => {
    // Someone who left keeps their cards in the cloud; nobody here shows them.
    const on = new Set([state.me?.id, ...(rest.people ?? state.people).map((p) => p.id)]);
    const { cards, mates } = splitCards((all ?? []).filter((c) => on.has(c.personId)), state.me?.id ?? null);
    // A copy on an older build still publishes its raw first sentence.
    return { ...rest, cards: cards.map((c) => (c.title ? { ...c, title: shortTitle(String(c.title)) } : c)), teamMates: mates };
  };
  const rooms = roomsSetup ? createRooms({
    backend: () => backend, me: () => state.me, team: () => state, now, log, onChange,
    findFile: (ref, how = {}) => findFileToSend({ ref, meant: how.meant === true, products: store.listProducts({ includeArchived: true }) }),
    ...roomsSetup,
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
  // conversation, and the newest of those is where the talk is. A thread started
  // with a subject is never it.
  function conversationIn(slug: string) {
    let rows: TeamItem[] = [];
    try { rows = store.listItems().filter((i) => i.product === slug && !i.agent && !isTaskRow(i) && !isWorkThread(i)); } catch { rows = []; }
    return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;
  }

  // The record of exactly you and these people, made the first time and reused
  // after. Reused only if one of you made it: found by review 2026-10-01, a
  // teammate could make a "direct" record holding you and somebody else, and the
  // next message went into it, where its maker read it.
  async function recordWith(me: string, others: string[]): Promise<Pick<TeamProduct, 'slug' | 'dir'>> {
    const to = others.length === 1 ? others[0] : others;
    let product = directWith(me, to);
    // The other person may have just made one, and the pull is what brings it here.
    if (!product) { await syncNow(); product = directWith(me, to); }
    return product ?? makeRecordWith(me, others);
  }

  async function makeRecordWith(me: string, others: string[]): Promise<Pick<TeamProduct, 'slug' | 'dir'>> {
    const made = makeDirect(accountRoot, { teamId: state.team!.id, me, others });
    // A START THAT FAILS LEAVES NOTHING BEHIND. A record shared only in part (the
    // cloud refused its people) was reused by the next send and never reached
    // anyone (found 2026-10-01 on a test copy).
    try {
      await backend!.shareProject({ id: made.projectId, teamId: state.team!.id, name: 'Direct', visibility: 'people', people: others, direct: true });
    } catch (err) {
      try { fs.rmSync(made.dir, { recursive: true, force: true }); } catch { /* the error below still says what failed */ }
      throw err;
    }
    return products().find((p) => p.dir === made.dir) ?? { slug: made.slug, dir: made.dir };
  }

  // WHAT A THREAD HANDS ON: its words, and every file its messages name that sits
  // in the project. A repository's files stay out: a coding thread names dozens
  // in passing.
  function briefOfThread(row: TeamRow, product: TeamProduct) {
    const said = store.readThread(product.slug, row.id).map((t) => t.text).filter(Boolean);
    // A one-line thread has only a title, and a rename must not lose those words.
    const brief = row.body || row.title;
    const words = [brief, row.result ? `Where it got to:\n\n${row.result}` : ''].filter(Boolean).join('\n\n');
    const root = fs.realpathSync(product.dir);
    const files: { rel: string; name: string; srcPath: string }[] = [];
    const tooBig: string[] = [];
    for (const rel of referencedFiles(brief, row.result, ...said, { dir: product.dir })) {
      if (rel === 'project.json' || files.length >= MAX_FILES_HANDED_ON) continue;
      let real: string;
      try { real = fs.realpathSync(path.join(product.dir, rel)); } catch { continue; }
      if (!real.startsWith(root + path.sep) || !fs.statSync(real).isFile()) continue;
      if (fs.statSync(real).size > MAX_MESSAGE_FILE_BYTES) tooBig.push(path.basename(rel));
      else files.push({ rel, name: path.basename(rel), srcPath: real });
    }
    return { words, files, tooBig };
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
    const people = team ? teamPeopleShown(await backend!.teamPeople(team.id)) : [];
    const cards = team ? await backend!.listCards() : [];
    // An invite lookup that fails (an older cloud, a dropped request) leaves
    // you signed in with nothing offered, never signed out.
    const invites = team ? [] : await backend!.pendingInvites().catch((err) => { log(`team: invites: ${err.message}`); return []; });
    // The invites this team has out, so the settings page can say who has not
    // joined yet and let them be cancelled.
    const sent = team && backend!.listInvites ? await backend!.listInvites(team.id).catch(() => []) : [];
    set(withCards(cards, { team, people, invites, sent, since: me ? kept().getSince(me) : null }));
  }

  // WHO HAS OPENED EACH CONVERSATION, by `${slug}/${id}` then person. An older
  // cloud without the table answers nothing, and the rest of the pass goes on.
  async function readSeen() {
    if (!backend?.seenMarks) return {};
    const marks = await backend.seenMarks().catch((err) => { log(`team: read marks: ${err.message}`); return null; });
    if (!marks) return {};
    const slugOf = new Map(products().filter((p) => p.team?.direct).map((p): [string, string] => [p.team!.projectId, p.slug]));
    const seen: Record<string, Record<string, number>> = {};
    for (const m of marks) {
      const slug = slugOf.get(m.projectId);
      if (slug && m.personId !== state.me?.id) (seen[`${slug}/${m.itemId}`] ??= {})[m.personId] = m.at;
    }
    return { seen };
  }
  // What this copy last said it had seen, so opening the same row again sends nothing.
  const seenSent = new Map();

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
          ? await Promise.all([backend!.listCards(), backend!.teamPeople(state.team.id).then(teamPeopleShown), backend!.me()])
          : [[], [], state.me];
        set(withCards(cards, { lastSyncAt: Date.now(), error: null, people, me: me ?? state.me, ...(await readSeen()) }));
        if (state.team) {
          noticeEndedWaits({
            products: products(), read: (p: TeamProduct) => disk.readWorkItems(p.dir), cards, now: now(), me: state.me?.id ?? null,
            nameOf: (id: string) => people.find((p) => p.id === id)?.name ?? 'Someone',
            write: (dir: string, id: string, patch: Record<string, unknown>) => disk.updateWorkItem(dir, id, patch, { source: 'system' }),
          });
          await handOverWhatLeft(cards, people);
        }
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

  async function handOverWhatLeft(cards: SyncCard[], people: TeamPerson[]) {
    if (!backend?.departures || !state.me || !state.team) return;
    const departures = await backend.departures(state.team.id).catch((err: Error) => { log(`team: who left: ${err.message}`); return []; });
    if (!departures.length) return;
    const me = state.me.id;
    const moved = await handOverDepartures({
      departures, me, people, cards, now: now(), log: (line = '') => log(line),
      products: products(),
      read: (p: TeamProduct) => disk.readWorkItems(p.dir),
      write: (dir: string, id: string, patch: Record<string, unknown>, source: string, at?: number) => disk.updateWorkItem(dir, id, patch, { source, ...(at ? { now: at } : {}) }),
      // As giveTask does, without its sync: this runs inside one.
      give: async (to: string, { title, body, priority, due }: { title: string; body: string; priority: number; due?: string }) => {
        const record = directWith(me, to) ?? await makeRecordWith(me, [to]);
        store.composeItem(record.slug, {
          title, body, priority: Number.isFinite(priority) && priority > 0 ? Math.trunc(priority) : 0,
          assignee: to, ...(due ? { due } : {}), people: [me, to], labels: [GIVEN_TASK],
        });
      },
      compose: (slug: string, fields: Record<string, unknown>) => store.composeItem(slug, fields),
      makeMate: ({ name, job, memory }: { name?: string; job?: string | null; memory?: unknown }) => {
        if (!store.teammates) return;
        const home = products().find((p) => !p.team?.direct && !p.practice && !p.personal);
        const made = store.teammates.create({ name, job, ...(home ? { product: home.slug } : {}) });
        store.teammates.remember(made.id, memory);
      },
      isDone: (key: string) => kept().handedOver().includes(key),
      markDone: (key: string) => kept().markHandedOver(key),
    });
    if (moved) onChange();
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

  function continuable(owner: string, threadId: string) {
    if (!backend || !threadShare || !state.me) throw new Error('sign in first');
    if (owner === state.me.id) throw new Error('that thread is yours already');
    const card = (state.cards ?? []).find((c) => c.personId === owner && c.threadId === threadId);
    const work = card ? threadShare.read(owner, threadId) : null;
    if (!work?.shared) throw new Error('that thread is not shared with you');
    return { card: card!, work };
  }

  // Which tools you have, for a teammate wondering who to ask. Told on sign-in and
  // on every change. A failure is a stale line on a teammate's tile, nothing more.
  let connectionIds: (() => unknown) | null = null;
  async function publishConnections() {
    if (!backend || !connectionIds) return;
    try {
      await backend.setConnections?.(await connectionIds());
      await refreshTeam();
    } catch (err) { console.warn('zero: could not tell the team which tools you have connected:', (err as Error | undefined)?.message ?? err); }
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
    void publishConnections();
    if (state.settling) set({ settling: false });
    phoneInbox = makePhoneInbox();
    const listCards = () => [
      ...cardsFor({ products: products(), readItems: (p) => disk.readWorkItems(p.dir), since: state.me ? kept().getSince(state.me.id) : null, me: state.me?.id ?? null, running: runningIds() }),
      ...(ownMates() ?? []).map((t) => mateCard(t, { now: t.now ?? null, running: !!t.running, at: t.updatedAt ?? t.createdAt ?? 0 })),
    ];
    threadShare = createThreadShare({
      backend,
      me: me.id,
      myName: () => state.me?.name ?? null,
      root: path.join(accountRoot, '_team-threads', me.id),
      listCards,
      listThreads: () => {
        const threads = new Map<string, { item: PhoneItem; product: TeamProduct }>();
        for (const product of products()) {
          if (product.team?.direct) continue;
          for (const item of disk.readWorkItems(product.dir)) threads.set(item.id, { item, product });
        }
        return threads;
      },
      historyOf: (slug: string, id: string) => store.readHistory(slug, id, { max: Number.MAX_SAFE_INTEGER }),
      listProducts: () => store.listProducts({ includeArchived: true }),
      disk,
      accountRoot,
      storeRoot: store.config?.storeRoot,
      onChange,
      log,
      now,
    });
    sync = createTeamSync({
      backend,
      disk,
      log,
      state: kept(),
      // ARCHIVED ONES COUNT AS HERE. Asked of the visible list, a shared
      // project you archived read as missing and was joined again beside it.
      listShared: () => { try { return listSharedProjects(store.listProducts({ includeArchived: true })); } catch { return []; } },
      joinProject: (project) => joinSharedProject(accountRoot, project),
      listCards,
      teamIdOf: () => state.team?.id ?? null,
      threadShare,
      carrierOptions,
      now,
      findFile: ({ ref, project, meant }) => {
        const all = store.listProducts({ includeArchived: true });
        return findFileToSend({ ref, meant, products: all, conversation: { dir: project.dir, people: all.find((p) => p.dir === project.dir)?.team?.people ?? [] } });
      },
    });
    stopLoop();
    timer = setInterval(() => { syncNow(); }, intervalMs);
    timer.unref?.();
    unsubscribe = backend.subscribe(() => { syncNow(); });
    await syncNow();
  }

  return {
    state: () => ({ ...state, sharedFileNews: threadShare?.fileNews() ?? [], ...(rooms ? { rooms: rooms.state() } : {}) }),
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
      threadShare = null;
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

    bindConnections(ids: () => unknown) { connectionIds = ids; void publishConnections(); },
    publishConnections,

    // A line you write about yourself, held until the end of today, tomorrow
    // or this week, or until you clear it. Saying nothing clears it.
    async setStatus({ text, hold = 'open', until }: { text?: unknown; hold?: string; until?: number } = {}) {
      if (!backend) throw new Error('sign in first');
      const status = await backend.setStatus({ text, until: statusEnds({ hold, until }, now()) });
      set({ me: { ...state.me!, status } });
      return state;
    },

    // With `handTo`, their open work goes to that person and each of their AI
    // teammates to whoever `mates` names, or nobody (paused).
    async removeMember(personId: string, { handTo = null, mates = [] }: { handTo?: string | null; mates?: { id?: string; to?: string | null }[] } = {}) {
      if (!backend || !state.team) throw new Error('start or join a team first');
      if (personId === state.me?.id) throw new Error('to leave the team, use Leave team');
      const person = state.people.find((p) => p.id === personId);
      const handover = handTo ? {
        handTo,
        name: person?.name ?? '',
        mates: (state.teamMates ?? []).filter((m) => m.owner === personId).map((m) => ({
          id: m.id, name: m.name, job: m.job, to: mates.find((c) => c?.id === m.id)?.to ?? null,
        })),
      } : null;
      if (handover && !state.people.some((p) => p.id === handTo && p.id !== personId)) throw new Error('hand their work to somebody on the team');
      await backend.removeMember(state.team.id, personId, handover);
      await refreshTeam();
      if (handover) await syncNow();
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
    async message(toIn: string | string[] | null | undefined, body: unknown, priority?: number | null, files: AttachmentFile[] = [], { voice, forAgent, subject }: MessageExtras = {}) {
      if (!backend || !state.team || !state.me) throw new Error('start or join a team first');
      const me = state.me.id;
      // One person or a few: the same conversation for the same people.
      const others = [...new Set(([] as string[]).concat(toIn ?? []).filter((p) => p && p !== me))].sort();
      if (!others.length) throw new Error('pick someone to message');
      if (others.length > 11) throw new Error('a message goes to at most eleven people');
      if (others.some((p) => !state.people.some((q) => q.id === p))) throw new Error('that person is not on your team');
      const words = String(body ?? '').trim();
      const carried = (Array.isArray(files) ? files : []).filter((f) => f && (f.dataBase64 || f.srcPath));
      if (!words && !carried.length) throw new Error('a message needs some words');
      const product = await recordWith(me, others);
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
      // A SUBJECT IS A PIECE OF WORK, so it gets a row of its own beside the
      // conversation: its own name, Done, files and comments.
      const about = String(subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      const title = about || shortTitle(words) || (carried.length === 1 ? String(carried[0].name ?? 'A file') : `${carried.length} files`);
      const convo = about ? null : conversationIn(product.slug);
      if (convo) {
        store.answerItem(product.slug, convo.id, { answer: text, voice, forAgent });
        // Who answers next is whoever did not speak last (shared/team-rules.mjs,
        // `inMyInbox`); the assignee stays for a Mac on an older build.
        store.teamPatch(product.slug, convo.id, { assignee: others[0] });
        onChange();
        await syncNow();
        return store.readItem(product.slug, convo.id);
      }
      const level = Number.isFinite(priority) && priority! > 0 ? Math.trunc(priority!) : 0;
      const item = store.composeItem(product.slug, { title, body: text, priority: level, assignee: others[0], people: [me, ...others], voice, forAgent, ...(about ? { labels: [WORK_THREAD] } : {}) });
      onChange();
      await syncNow();
      return item;
    },

    /**
     * MOVE A MESSAGE TO A NEW THREAD: it and its replies in thread open a thread
     * about that work with the same people, and a link is left under it. The
     * words are quoted under the mover's name, since a line can only be written
     * as its writer; the conversation keeps every word.
     */
    async moveToThread({ product: slug, id, on }: { product?: string; id?: string; on?: unknown } = {}) {
      if (!backend || !state.team || !state.me) throw new Error('start or join a team first');
      const product = products().find((p) => p.slug === slug && p.team?.direct);
      if (!product) throw new Error('only a message in a conversation can move to a new thread');
      const row = store.readItem(slug!, id!);
      if (!row || isTaskRow(row)) throw new Error('only a message in a conversation can move to a new thread');
      const lines = store.readHistory(slug!, id!, { max: Number.MAX_SAFE_INTEGER }).filter((l): l is TeamHistoryLine => !!l);
      const edits = row.edits ?? {};
      const wordsOf = (l: TeamHistoryLine) => {
        const e = edits[l.uid as string];
        if (e?.gone) return '';
        return String(e?.text ?? l.patch?.answer ?? l.patch?.body ?? '').trim();
      };
      const first = lines.find((l) => l.uid === on && (l.patch?.answer || l.patch?.body));
      if (!first || !wordsOf(first)) throw new Error('that message is not in this conversation');
      const said = [first, ...lines.filter((l) => l.patch?.inReplyTo === on && wordsOf(l) && !MOVED_NOTE.test(wordsOf(l)))];
      const me = state.me.id;
      const myFirstName = state.me.name?.split(/\s+/)[0] || 'Me';
      const nameOf = (by: string | undefined) => (by === me ? 'You' : (state.people.find((p) => p.id === by)?.name ?? 'Someone').split(/\s+/)[0]);
      const others = [...new Set([...(product.team!.people ?? []), product.team!.sharedBy].filter((p): p is string => !!p && p !== me))];
      const from = isWorkThread(row) ? (row.label || row.title)!.replace(/[[\]\\]/g, '') : 'the conversation';
      const body = [...said.map((l) => `${l.by === me ? myFirstName : nameOf(l.by)}: ${wordsOf(l)}`), `Moved from [${from}](${id}).`].join('\n\n');
      // The longest sentence carries the work; the first is often "A as well."
      const sentences = wordsOf(first).replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ').split(/(?<=[.?!])\s+/);
      const title = shortTitle(sentences.reduce((a, b) => (b.length > a.length ? b : a), '')) || 'Moved messages';
      const made = store.composeItem(slug!, { title, body, assignee: others[0], people: [me, ...others], labels: [WORK_THREAD] });
      store.answerItem(slug!, id!, { answer: `Moved to a new thread: [${title.replace(/[[\]\\]/g, '')}](${made.id})`, inReplyTo: first.uid });
      onChange();
      await syncNow();
      return made;
    },

    /**
     * Words to someone else's AI teammate. They go to its owner, in the record the
     * two of you share, because only its owner directs it (their copy decides
     * whether it wakes: shared/teammate-reach.mjs).
     */
    async messageMate({ owner, mate, text }: { owner?: string; mate?: string; text?: unknown } = {}) {
      if (!state.me) throw new Error('sign in first');
      if (owner === state.me.id) throw new Error('that one is yours: write to it on its page');
      const it = (state.teamMates ?? []).find((m) => m.id === mate && m.owner === owner);
      if (!it) throw new Error('that AI teammate is no longer on the team');
      return this.message(owner, text, undefined, [], { forAgent: { id: it.id, name: it.name } });
    },

    /**
     * A TASK TO ONE PERSON. Its own row in the record you two share, never your
     * project, so it reaches them and no agent starts on it on either Mac
     * (shared/team-rules.mjs). A file with a `rel` is one the words name: its
     * links are pointed at the copy.
     */
    async giveTask(toIn: string | string[] | null | undefined, { title, body, priority, due, files = [], voice, visibility, visibleTo, blockedBy }: TaskInput = {}) {
      if (!backend || !state.team || !state.me) throw new Error('start or join a team first');
      const me = state.me.id;
      const list = [...new Set(([] as string[]).concat(toIn ?? []).filter(Boolean))];
      if (list.length !== 1) throw new Error('a task goes to one person; send it as a message to several');
      const [to] = list;
      if (to === me) throw new Error('that task would be to yourself');
      if (!state.people.some((p) => p.id === to)) throw new Error('that person is not on your team');
      const words = String(body ?? '').trim();
      const carried = (Array.isArray(files) ? files : []).filter((f) => f && (f.dataBase64 || f.srcPath));
      const names = state.people.filter((p) => p.id !== me).map((p) => p.name ?? '');
      const named = taskTitle(String(title ?? ''), names, words)
        || (carried.length === 1 ? String(carried[0].name ?? 'A file') : `${carried.length} files`);
      if (!words && !carried.length && !String(title ?? '').trim()) throw new Error('a task needs some words');
      const product = await recordWith(me, [to]);
      const saved = saveAttachments(product.dir, carried);
      const moved = carried.map((f, k): [string | undefined, SavedAttachment] => [f.rel, saved[k]]).filter((m): m is [string, SavedAttachment] => !!m[0]);
      let text = words;
      // The links first, so what is left of a path is only ever prose.
      for (const [rel, copy] of moved) text = text.split(`](${rel})`).join(`](${copy.rel})`);
      for (const [rel, copy] of moved) text = text.split(rel).join(copy.name);
      const unlinked = saved.filter((s) => !text.includes(`](${s.rel})`));
      const full = [text, attachmentMarkdown(unlinked)].filter(Boolean).join('\n\n') || named;
      const level = Number.isFinite(priority) && priority! > 0 ? Math.trunc(priority!) : 0;
      // No word on who sees it leaves the task between the two of you, as tasks always were.
      const seen = visibility === 'team' ? { visibility: 'team' }
        : visibility === 'people' && Array.isArray(visibleTo) && visibleTo.length ? { visibility: 'people', visibleTo: [...new Set(visibleTo.map(String))] } : {};
      const blocks = (Array.isArray(blockedBy) ? blockedBy : []).filter((id) => typeof id === 'string' && /^(person|card|name):./.test(id));
      const item = store.composeItem(product.slug, {
        title: named, body: full, priority: level, assignee: to, ...(due ? { due } : {}), people: [me, to], labels: [GIVEN_TASK], voice,
        ...seen, ...(blocks.length ? { blockedBy: blocks } : {}),
      });
      onChange();
      await syncNow();
      return item;
    },

    /**
     * GIVE A THREAD TO A PERSON: its new name, brief, priority, due day and files
     * go as a task, and the thread closes here saying who has it. The close is
     * in your hand rather than the app's, or Done would read it as news and put
     * it in your own Needs you.
     */
    async handOn({ product: slug, id, to }: { product: string; id: string; to: string }) {
      if (!backend || !state.team || !state.me) throw new Error('start or join a team first');
      const product = products().find((p) => p.slug === slug);
      const row = product ? store.readItem(slug, id) : null;
      if (!product || !row) throw new Error('that thread is gone');
      if (product.team?.direct) throw new Error('a conversation cannot be handed on');
      if (row.status === 'done') throw new Error('that thread is finished');
      const person = state.people.find((p) => p.id === to);
      if (!person) throw new Error('that person is not on your team');
      if (to === state.me.id) throw new Error('that thread is yours already');
      const { words, files, tooBig } = briefOfThread(row, product);
      const left = tooBig.length ? `(Not sent: ${tooBig.join(', ')}, over 10 MB. Ask ${state.me.name || 'me'} for ${tooBig.length === 1 ? 'it' : 'them'}.)` : '';
      const made = await this.giveTask(to, {
        title: row.label || row.title,
        body: [words, left].filter(Boolean).join('\n\n'),
        priority: row.priority, due: row.due && row.due !== 'none' ? row.due : undefined, files,
      });
      // As your own words: a note would be drawn as the agent's checkpoint.
      store.answerItem(slug, id, { answer: `Given to ${person.name || 'a teammate'}.`, status: 'done' });
      onChange();
      return made;
    },

    /** A task's words and files, for a new thread of your own: its links would point at nothing there. */
    taskBrief(slug: string, id: string) {
      const product = products().find((p) => p.slug === slug);
      const row = product ? store.readItem(slug, id) : null;
      if (!product || !row || !isTaskRow(row)) throw new Error('that task is gone');
      const files: { name: string; srcPath: string }[] = [];
      const body = String(row.body ?? row.title ?? '').replace(/!?\[([^\]\n]*)\]\(attachments\/([^)\s]+)\)\n?/g, (_: string, name: string, file: string) => {
        const srcPath = path.join(product.dir, 'attachments', path.basename(file));
        if (fs.existsSync(srcPath)) files.push({ name: name || path.basename(file), srcPath });
        return '';
      }).trim();
      return { title: row.label || row.title, body, files };
    },

    /** A teammate's shared thread as this copy holds it: its messages, comments and folder. */
    threadWork(owner: string, threadId: string) {
      return threadShare?.read(owner, threadId) ?? { shared: false, lines: [], earlier: 0, product: null, dir: null };
    },

    /**
     * What a thread of your own starts with when you carry on a teammate's.
     * Only one whose card you can read and whose work is here: a private thread
     * never reaches this copy, so it can never be seeded from.
     */
    async continueBrief(owner: string, threadId: string) {
      const { work, card } = continuable(owner, threadId);
      const nameOf = (id: string) => (state.people ?? []).find((p) => p.id === id)?.name?.split(/\s+/)[0] ?? null;
      const brief = briefToContinue({ work, title: card.title, ownerName: nameOf(owner) ?? 'A teammate', nameOf });
      return { ...brief, from: { personId: owner, threadId } };
    },

    /** Tells the owner, once their thread has been carried on. */
    async continuedThread(owner: string, threadId: string) {
      continuable(owner, threadId);
      await backend!.addThreadComment(owner, threadId, CONTINUED_NOTE);
      await threadShare!.refreshComments();
      onChange();
      syncNow();
      return state;
    },

    /** The teammates' threads this person may search, each with a stamp that changes with it (main/everything-found.mjs). */
    sharedThreads: () => readableSharedThreads({ cards: state.cards, me: state.me?.id ?? null, folders: threadShare?.folders() ?? [] }),

    /** Those folders, as projects the file pane can read. */
    sharedThreadProducts: () => threadShare?.products() ?? [],

    // Words to a thread's owner. The cloud decides who may: whoever can read the card.
    async commentOnThread(owner: string, threadId: string, text: unknown) {
      if (!backend || !threadShare) throw new Error('sign in first');
      const words = String(text ?? '').trim();
      if (!words) throw new Error('a comment needs some words');
      await backend.addThreadComment(owner, threadId, words);
      await threadShare.refreshComments();
      onChange();
      syncNow();
      return state;
    },

    /** Folders and where files sit, as the cloud holds them for this person. Null with no team to reach. */
    fileFolders() {
      if (!backend?.fileFolders || !state.team) return null;
      const teamId = state.team.id;
      return {
        read: async () => ({ folders: await backend!.fileFolders!(), places: await backend!.filePlaces!() }),
        putFolder: (row: unknown) => backend!.putFileFolder!(teamId, row),
        place: (owner: string, threadId: string, row: unknown) => backend!.placeFile!(owner, threadId, row),
      };
    },

    /** The team's version line (main/version-line.mjs). Null with no team to reach. */
    fileVersions() {
      if (!backend?.addFileVersion || !state.team) return null;
      const teamId = state.team.id;
      return {
        append: (row: unknown) => backend!.addFileVersion!(teamId, row),
        read: () => backend!.fileVersions!(teamId),
      };
    },

    // A note, resolve, approval or "seen" on a file of a teammate's thread. Kept on
    // this computer first, so a comment typed with no connection is not lost.
    async markSharedFile(owner: string, threadId: string, mark: unknown) {
      if (!backend || !threadShare) throw new Error('sign in first');
      const kept = await threadShare.addMark(owner, threadId, mark);
      if (!kept) throw new Error('that note could not be read');
      onChange();
      syncNow();
      return state;
    },

    /** This person opened a conversation: once per new message, the cloud says when. */
    async seen(slug: string, id: string) {
      if (!backend?.markSeen || !state.me) return false;
      const product = products().find((p) => p.slug === slug && p.team?.direct);
      const row = product ? store.readItem(slug, id) : null;
      if (!product || !row) return false;
      const key = `${slug}/${id}`;
      if ((seenSent.get(key) ?? -1) >= (row.updatedAt ?? 0)) return false;
      seenSent.set(key, row.updatedAt ?? 0);
      try { await backend.markSeen(product.team!.projectId, id); } catch (err) { seenSent.delete(key); log(`team: read mark: ${(err as Error).message}`); return false; }
      return true;
    },

    syncNow,
    /** "Try again" on a file in a conversation that was not delivered. */
    async retryFile({ product, src }: { product?: string; src?: unknown }) {
      const dir = products().find((p) => p.slug === product && p.team?.direct)?.dir;
      if (!dir || !sync?.retryCarried || !(await sync.retryCarried(dir, plainRef(String(src ?? ''))))) return false;
      await syncNow();
      return true;
    },
    /** A first name for the tile that says whose computer a file waits for. */
    firstNameOf: (id: string) => (state.people ?? []).find((p) => p.id === id)?.name?.split(/\s+/)[0] ?? null,
    stop: stopLoop,
  };
}

const MAX_FILES_HANDED_ON = 20;
// The link a move leaves under a message, which a second move does not carry.
const MOVED_NOTE = /^Moved to a new thread: \[[^\]]*\]\(w-[0-9a-f]{10}\)$/;

// Where the service keeps its sync cursors: beside the store's own records.
export function teamStateFile(storeRoot: string) {
  return path.join(storeRoot, '.team-sync.json');
}

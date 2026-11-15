// KEEPING A SHARED PROJECT THE SAME ON EVERY TEAMMATE'S MAC.
//
// One pass (`syncOnce`) does four things, in this order:
//
//   1. JOIN. A project somebody shared that this Mac does not have yet becomes
//      a project of its own here, in a folder of its own.
//   2. PUSH. Every ledger line this person wrote in a shared project since the
//      last push goes to the cloud. A byte offset per project is the cursor,
//      since the ledger only grows. A line written before anyone signed in
//      (the project's history from when it was private) goes too, as this
//      person's, with an id made from its own bytes so it can never go twice.
//   3. PULL. Every line the cloud has that this Mac has not seen comes in
//      through the store's one write path (`appendForeignLines`), at most
//      once, holding only what a teammate may set here (shared/team-rules.mts
//      whatATeammateMaySet). A line this person wrote comes back too, in a
//      conversation and nowhere else (whatYourOtherCopyMaySet), because a
//      second copy of the app signed in as them is a Mac that has not seen it
//      either; the uid is what makes pulling one back onto the copy that wrote
//      it cost nothing.
//   4. PRIVATE WORK. One title-free line per open task in a private project
//      (who, what state, when it moved), and only when that set changed.
//
//   And in a conversation, the files its messages link to (below, FILES) and
//   every other file they name (./carry-files.mts).
//
// Everything outside this file is passed in, so two "Macs" can run in one test
// over an in-memory cloud. The app wires the real ones in main/team/index.mts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { whatATeammateMaySet, whatYourOtherCopyMaySet } from '../../shared/team-rules.mts';
import type { CloudProject, SharedProjectRef } from './projects.mts';
import { MAX_CARRIED_BYTES, namedFiles, wordsOfLine } from '../../shared/carried-files.mts';
import { createFileCarrier } from './carry-files.mts';
import type { LinkPlace } from './link-edits.mts';

/** A ledger line as it is written and pushed; other keys pass through. */
export interface LedgerLine {
  [key: string]: unknown;
  by?: string;
  uid?: string;
  id?: string;
  ts?: number;
  patch?: { carries?: unknown[]; [key: string]: unknown };
}

/** A file a message names that the cloud did not have yet. */
export interface WantedFile { name: string; since: number; checked: number }

/** Where one shared project's push, pull and file cursors stand. */
export interface SyncCursor {
  pushedTo: number;
  pulledSeq: number;
  filesFrom?: number;
  wanted?: WantedFile[];
  carriedFrom?: number;
  carrying?: CarryPending[];
}

/** A file a message of mine names that is not yet delivered, tried again for a while. */
export interface CarryPending { ref: string; id: string; meant: boolean; since: number; tries: number }

export interface SyncState {
  get(projectId: string): SyncCursor;
  set(projectId: string, value: SyncCursor): void;
  getCardsHash(): string | null;
  setCardsHash(hash: string): void;
  getTeam(personId: string): string | null;
  setTeam(personId: string, teamId: string | null): void;
  getSince(personId: string): number | null;
  setSince(personId: string, at: number): void;
  handedOver(): string[];
  markHandedOver(key: string): void;
  /** When the newest comment on this person's links already noted was made. */
  getLinkComments(personId: string): number | null;
  setLinkComments(personId: string, at: number): void;
  /** Where a shared link's file is on this computer, by the link's source (main/team/link-edits.mts). */
  getLinkPlace(source: string): LinkPlace | null;
  setLinkPlace(source: string, place: LinkPlace): void;
}

type FsForState = Pick<typeof fs, 'readFileSync' | 'writeFileSync' | 'renameSync'>;

/** What the cloud holds of a thread, as it is published for the team. */
export interface SyncCard { threadId: string; personId?: string; state?: string; visible?: boolean; title?: unknown; updatedAt?: unknown; [key: string]: unknown }

export interface SyncFiles {
  size(dir: string, name: string): number | null;
  read(dir: string, name: string): Buffer;
  write(dir: string, name: string, bytes: Buffer): void;
}

export interface SyncDisk {
  readLinesFrom(dir: string, offset: number): { lines: LedgerLine[]; end: number };
  appendForeignLines(dir: string, lines: LedgerLine[]): number;
}

export interface SyncBackend {
  personId?: string | null;
  me(): Promise<{ id: string } | null | undefined>;
  listProjects(): Promise<CloudProject[]>;
  pushLines(projectId: string, lines: LedgerLine[]): Promise<number>;
  pullLines(projectId: string, afterSeq: number, limit: number): Promise<{ seq: number; line: LedgerLine | null }[]>;
  putCards(teamId: string, cards: SyncCard[]): Promise<void>;
  hasFiles?(projectId: string, names: string[]): Promise<string[]>;
  getFile?(projectId: string, name: string): Promise<unknown>;
  putFile?(projectId: string, name: string, data: string): Promise<boolean>;
  putPiece?(projectId: string, name: string, bytes: Buffer): Promise<unknown>;
  getPiece?(projectId: string, name: string): Promise<unknown>;
}

/** What a conversation's file carrier answers to `send` (./carry-files.mts). */
export interface CarrySent { sent?: boolean; entry?: object; looking?: boolean; working?: boolean; failed?: boolean }

export interface FileCarrier {
  send(ref: string, how?: { meant?: boolean; final?: boolean }): Promise<CarrySent>;
  giveUp(ref: string, why?: string): void;
  expect(ref: string, by: string, at: unknown): void;
  forget(ref: string): void;
  take(entries: unknown[]): Promise<void>;
  takeMissing(): Promise<void>;
}

export interface TeamSyncOptions {
  backend: SyncBackend;
  disk: SyncDisk;
  state: SyncState;
  listShared: () => SharedProjectRef[];
  joinProject: (project: CloudProject) => SharedProjectRef | null | undefined | Promise<SharedProjectRef | null | undefined>;
  listCards?: () => SyncCard[] | null | undefined;
  teamIdOf?: () => string | null | undefined;
  files?: SyncFiles;
  /** Runs after the cards: the cloud takes a thread's work only while it has a card. */
  threadShare?: { pass(teamId: string | null | undefined): unknown } | null;
  /** What on this Mac a name in a message may mean. */
  findFile?: ((ask: { ref: string; project: SharedProjectRef; meant: boolean }) => unknown) | null;
  /** Options for each conversation's file carrier (tests make its waits short). */
  carrierOptions?: Record<string, unknown> | null;
  now?: () => number;
  log?: (line: string) => void;
}

export interface SyncReport { joined: string[]; notJoined: number; pushed: number; pulled: number; cards: boolean }

const PAGE = 500;
// HOW MANY SHARED PROJECTS A MAC TAKES ON BY ITSELF. Anyone on the team can
// share a project, and each one becomes a folder here; past this many, a pass
// joins no more, so a teammate cannot fill this disk with folders.
export const MAX_SHARED_PROJECTS = 50;

// FILES: A PICTURE IN A MESSAGE GOES WITH IT (w-140ac855b1, 2026-10-13).
//
// A picture pasted into a message is saved in the project's attachments folder
// and the message links to it, `![…](attachments/…)`. Only the line used to
// cross, so every picture sent to a teammate arrived as "missing image". Now
// the sender's Mac puts each file it links to in the cloud BEFORE pushing the
// line, and the reader's Mac takes the file down BEFORE the line lands, so a
// message is never drawn without its picture (a picture drawn as missing stays
// missing until the thread is reopened).
//
// Only in a conversation: an ordinary shared project's words never cross
// (shared/team-rules.mts), so nothing they link to does either. And every file
// call is best effort. A cloud without the table, or one file that will not
// come, must never stop a message.
export const MAX_MESSAGE_FILE_BYTES = MAX_CARRIED_BYTES;
// A file named in a message the cloud does not have yet, which is a sender who
// has not updated. Asked about again at most once a minute, for two weeks.
const WANTED_MAX = 200;
const WANTED_EVERY_MS = 60_000;
const WANTED_FOR_MS = 14 * 24 * 60 * 60 * 1000;
// A PLAIN NAME and nothing else: no slash, no leading dot. The reader writes
// what a teammate's line names, so a name is all a line may hand it.
const NAMED = /\]\(attachments\/([A-Za-z0-9][\w.-]{0,159})\)/g;
const CARRY_AGAIN_FOR_MS = 10 * 60 * 1000;
const CARRY_PENDING_MAX = 30;
// Passes a cloud may refuse a file before it is called not delivered.
const CARRY_TRIES = 6;

/** The files a ledger line's message links to, by name, each once. */
export function filesNamedIn(line: LedgerLine | null | undefined): string[] {
  if (!line || typeof line !== 'object' || !line.patch) return [];
  return [...new Set([...JSON.stringify(line.patch).matchAll(NAMED)].map((m) => m[1]))];
}

// The attachments folder of a project on this Mac.
export const diskFiles: SyncFiles = {
  size(dir, name) {
    try { const st = fs.statSync(path.join(dir, 'attachments', name)); return st.isFile() ? st.size : null; } catch { return null; }
  },
  read: (dir, name) => fs.readFileSync(path.join(dir, 'attachments', name)),
  // `wx`: a file already here under that name is never replaced.
  write(dir, name, bytes) {
    fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
    try { fs.writeFileSync(path.join(dir, 'attachments', name), bytes, { flag: 'wx' }); } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err; }
  },
};

// Where each shared project's cursors stand, kept between runs.
export function memorySyncState(): SyncState {
  const places = new Map<string, LinkPlace>();
  const map =new Map<string, Partial<SyncCursor> & { hash?: string | null; keys?: string[]; [personId: string]: unknown }>();
  return {
    get: (projectId) => ({ pushedTo: 0, pulledSeq: 0, ...(map.get(projectId) || {}) }),
    set: (projectId, value) => { map.set(projectId, { ...value }); },
    getCardsHash: () => map.get('__cards__')?.hash ?? null,
    setCardsHash: (hash) => { map.set('__cards__', { hash }); },
    getTeam: (personId) => map.get('__teams__')?.[personId] as string | null | undefined ?? null,
    setTeam: (personId, teamId) => { map.set('__teams__', { ...(map.get('__teams__') || {}), [personId]: teamId }); },
    getSince: (personId) => map.get('__since__')?.[personId] as number | null | undefined ?? null,
    setSince: (personId, at) => { map.set('__since__', { ...(map.get('__since__') || {}), [personId]: at }); },
    handedOver: () => map.get('__handed__')?.keys ?? [],
    markHandedOver: (key) => { map.set('__handed__', { keys: [...(map.get('__handed__')?.keys ?? []), key] }); },
    getLinkComments: (personId) => map.get('__links__')?.[personId] as number | null | undefined ?? null,
    setLinkComments: (personId, at) => { map.set('__links__', { ...(map.get('__links__') || {}), [personId]: at }); },
    getLinkPlace: (source) => places.get(source) ?? null,
    setLinkPlace: (source, place) => { places.set(source, place); },
  };
}

export function fileSyncState(file: string, fs: FsForState): SyncState {
  let data: {
    projects?: Record<string, SyncCursor>;
    cardsHash?: string | null;
    teams?: Record<string, string | null>;
    since?: Record<string, number | null>;
    handedOver?: string[];
    linkComments?: Record<string, number>;
    linkPlaces?: Record<string, LinkPlace>;
  } = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  const save = () => {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };
  return {
    get: (projectId) => ({ pushedTo: 0, pulledSeq: 0, ...(data.projects?.[projectId] || {}) }),
    set: (projectId, value) => { data.projects = { ...(data.projects || {}), [projectId]: { ...value } }; save(); },
    getCardsHash: () => data.cardsHash ?? null,
    setCardsHash: (hash) => { data.cardsHash = hash; save(); },
    // WHICH TEAM THIS MAC IS IN, per person: once in one, it stays there
    // until that person says otherwise (main/team/index.mts).
    getTeam: (personId) => data.teams?.[personId] ?? null,
    setTeam: (personId, teamId) => { data.teams = { ...(data.teams || {}), [personId]: teamId }; save(); },
    // WHEN THIS PERSON STARTED SHARING ON THIS MAC. Threads from before it stay
    // theirs unless they share one (shared/thread-cards.mts, `shownToTeam`).
    getSince: (personId) => data.since?.[personId] ?? null,
    setSince: (personId, at) => { data.since = { ...(data.since || {}), [personId]: at }; save(); },
    // What this copy already moved for someone who left (main/team/departures.mts).
    handedOver: () => data.handedOver ?? [],
    markHandedOver: (key) => { data.handedOver = [...(data.handedOver ?? []), key]; save(); },
    // The newest comment on this person's shared links already put on a thread (main/team/link-comments.mts).
    getLinkComments: (personId) => data.linkComments?.[personId] ?? null,
    setLinkComments: (personId, at) => { data.linkComments = { ...(data.linkComments || {}), [personId]: at }; save(); },
    getLinkPlace: (source) => data.linkPlaces?.[source] ?? null,
    setLinkPlace: (source, place) => { data.linkPlaces = { ...(data.linkPlaces || {}), [source]: place }; save(); },
  };
}

// A line from before anyone signed in has no writer and no id. It is pushed as
// the sharer's, with an id made from its bytes, so a second push is the same id.
function adopt(line: LedgerLine, me: string): LedgerLine {
  if (line.by && line.uid) return line;
  const uid = line.uid || `h-${crypto.createHash('sha256').update(JSON.stringify(line)).digest('hex').slice(0, 24)}`;
  return { ...line, by: line.by || me, uid };
}

export function createTeamSync({ backend, disk, state, listShared, joinProject, listCards = () => [], teamIdOf = () => null, threadShare = null, files = diskFiles, findFile = null, carrierOptions = null, now = Date.now, log = () => {} }: TeamSyncOptions) {
  let running: Promise<SyncReport> | null = null;
  const saidBefore = new Set<string>();
  const quietly = async <T, F = undefined>(what: string, fn: () => T | Promise<T>, fallback?: F): Promise<Awaited<T> | F> => {
    try { return await fn(); } catch (err) { log(`team files: ${what}: ${(err as Error | undefined)?.message ?? err}`); return fallback as F; }
  };

  // Takes down whichever of `names` the cloud has and this Mac does not.
  // Answers the names still missing.
  async function takeFiles(project: SharedProjectRef, names: string[]): Promise<string[]> {
    const missing = [...new Set(names)].filter((n) => files.size(project.dir, n) == null);
    if (!missing.length || !backend.hasFiles) return missing;
    const there = new Set(await quietly('asking', () => backend.hasFiles!(project.projectId, missing), []));
    for (const name of missing.filter((n) => there.has(n))) {
      // One at a time: each can be ten megabytes.
      const data = await quietly(`taking ${name}`, () => backend.getFile!(project.projectId, name), null);
      const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : null;
      if (bytes && bytes.length <= MAX_MESSAGE_FILE_BYTES) await quietly(`saving ${name}`, () => files.write(project.dir, name, bytes));
    }
    return missing.filter((n) => files.size(project.dir, n) == null);
  }

  // Every line written here since the last look: the files your messages name
  // go up, and the files anyone's name that are not here are wanted. The first
  // look after updating starts at the top of the ledger, which is what sends a
  // picture from before this existed.
  async function sendFiles(project: SharedProjectRef, me: string) {
    if (!backend.putFile) return;
    const cursor = state.get(project.projectId);
    const { lines, end } = disk.readLinesFrom(project.dir, cursor.filesFrom ?? 0);
    const mine = new Set<string>();
    const wanted = new Map((cursor.wanted ?? []).map((w) => [w.name, w]));
    for (const line of lines) {
      for (const name of filesNamedIn(line)) {
        const size = files.size(project.dir, name);
        if (size == null) { if (!wanted.has(name)) wanted.set(name, { name, since: now(), checked: 0 }); }
        else if ((!line.by || line.by === me) && size <= MAX_MESSAGE_FILE_BYTES) mine.add(name);
      }
    }
    if (mine.size) {
      const there = await quietly('asking', () => backend.hasFiles!(project.projectId, [...mine]), null);
      if (!there) return; // Not now; this stretch of the ledger is looked at again next pass.
      for (const name of [...mine].filter((n) => !there.includes(n))) {
        const sent = await quietly(`sending ${name}`, async () => { await backend.putFile!(project.projectId, name, files.read(project.dir, name).toString('base64')); return true; }, false);
        if (!sent) return;
      }
    }
    state.set(project.projectId, { ...state.get(project.projectId), filesFrom: end, wanted: [...wanted.values()].slice(-WANTED_MAX) });
  }

  // One carrier per conversation, kept: a big file goes up and comes down in
  // the background, and a second carrier would start the same work again.
  const carriers = new Map<string, FileCarrier>();
  const carrierFor = (project: SharedProjectRef) => {
    if (!carriers.has(project.dir)) {
      carriers.set(project.dir, createFileCarrier({
        dir: project.dir,
        has: (names: string[]) => backend.hasFiles!(project.projectId, names),
        put: (name: string, data: string) => backend.putFile!(project.projectId, name, data),
        get: (name: string) => backend.getFile!(project.projectId, name),
        ...(backend.putPiece ? {
          putPiece: (name: string, bytes: Buffer) => backend.putPiece!(project.projectId, name, bytes),
          getPiece: (name: string) => backend.getPiece!(project.projectId, name),
        } : {}),
        find: (ref: string, how: { meant?: boolean } = {}) => findFile!({ ref, project, meant: how.meant === true }),
        now,
        log: (line = '') => log(line),
        ...(carrierOptions ?? {}),
      } as Parameters<typeof createFileCarrier>[0]));
    }
    return carriers.get(project.dir)!;
  };

  // Beyond the attachments above: every other file your own lines name goes up,
  // and a list of them follows on a line of its own, so a reader knows each name
  // and a message pushed before this existed still gets its file. What is not
  // finished (a big file going up, a name that finds nothing yet, a cloud that
  // did not answer) waits in `carrying`, each for a bounded time: an agent may
  // write the file just after the message that names it, but nothing is tried
  // for ever. A file the sender points at (a link, a code span, a path) is
  // `meant`; a bare word that looks like a file name is a guess.
  async function sendCarried(project: SharedProjectRef, me: string) {
    if (!findFile || !backend.putFile) return;
    const cursor = state.get(project.projectId);
    const { lines, end } = disk.readLinesFrom(project.dir, cursor.carriedFrom ?? 0);
    const carrier = carrierFor(project);
    const at = now();
    const pending = new Map((cursor.carrying ?? []).map((p): [string, CarryPending] => [p.ref, p]));
    const note = (ref: string, id: string, meant: boolean) => {
      pending.set(ref, { ref, id, meant: !!(meant || pending.get(ref)?.meant), since: at, tries: 0 });
    };
    for (const line of lines) {
      if (line?.by && line.by !== me) continue;
      if (!line?.id) continue;
      // A file over what one message-file call takes goes in parts.
      for (const name of filesNamedIn(line)) {
        if ((files.size(project.dir, name) ?? 0) > MAX_MESSAGE_FILE_BYTES) note(`attachments/${name}`, line.id, true);
      }
      for (const text of wordsOfLine(line)) {
        for (const { ref, meant } of namedFiles(text)) if (!ref.startsWith('attachments/')) note(ref, line.id, meant);
      }
    }
    const entries: object[] = [];
    const keep: CarryPending[] = [];
    let lastId = lines.findLast((l) => l?.id)?.id ?? null;
    for (const p of pending.values()) {
      const r = await carrier.send(p.ref, { meant: p.meant, final: at - p.since >= CARRY_AGAIN_FOR_MS });
      if (r.working) { keep.push(p); continue; }
      if (!r.sent) {
        if ((p.tries ?? 0) + 1 >= CARRY_TRIES) carrier.giveUp(p.ref, 'upload'); else keep.push({ ...p, tries: (p.tries ?? 0) + 1 });
        continue;
      }
      if (r.entry) { entries.push(r.entry); lastId = p.id; }
      if (r.looking && at - p.since < CARRY_AGAIN_FOR_MS) keep.push(p);
    }
    const unsaid = entries.filter((e) => { const k = JSON.stringify({ ...e, at: 0 }); if (saidBefore.has(k)) return false; saidBefore.add(k); return true; });
    if (unsaid.length && lastId) {
      const body = { id: lastId, ts: at, source: 'system', by: me, patch: { carries: unsaid } };
      const uid = `c-${crypto.createHash('sha256').update(JSON.stringify(unsaid)).digest('hex').slice(0, 24)}`;
      try { await backend.pushLines(project.projectId, [{ ...body, uid }]); } catch (err) {
        log(`team files: telling the others: ${(err as Error | undefined)?.message ?? err}`);
        for (const e of unsaid) saidBefore.delete(JSON.stringify({ ...e, at: 0 }));
        return;
      }
    }
    state.set(project.projectId, { ...state.get(project.projectId), carriedFrom: end, carrying: keep.slice(0, CARRY_PENDING_MAX) });
  }

  // "Try again" on a file that did not go: the one thing that sends a file again
  // after it was given up on.
  async function retryCarried(dir: string, ref: string) {
    const project = listShared().find((p) => p.dir === dir && p.direct === true);
    if (!project || !findFile) return false;
    const { lines } = disk.readLinesFrom(project.dir, 0);
    const named = lines.findLast?.((l) => l?.id && (wordsOfLine(l).some((t) => namedFiles(t).some((f) => f.ref === ref)) || filesNamedIn(l).some((n) => `attachments/${n}` === ref)));
    const id = named?.id ?? lines.findLast?.((l) => l?.id)?.id;
    if (!id) return false;
    carrierFor(project).forget(ref);
    const cursor = state.get(project.projectId);
    const rest = (cursor.carrying ?? []).filter((p) => p.ref !== ref);
    state.set(project.projectId, { ...cursor, carrying: [...rest, { ref, id, meant: true, since: now(), tries: 0 }] });
    for (const key of [...saidBefore]) if (key.includes(JSON.stringify(ref))) saidBefore.delete(key);
    return true;
  }

  async function takeWanted(project: SharedProjectRef) {
    if (findFile || backend.getFile) await carrierFor(project).takeMissing();
    const cursor = state.get(project.projectId);
    const at = now();
    const wanted = (cursor.wanted ?? []).filter((w) => at - w.since < WANTED_FOR_MS && files.size(project.dir, w.name) == null);
    const due = wanted.filter((w) => at - w.checked >= WANTED_EVERY_MS).map((w) => w.name);
    const still = new Set(due.length ? await takeFiles(project, due) : []);
    const kept = wanted.filter((w) => !due.includes(w.name) || still.has(w.name))
      .map((w) => (due.includes(w.name) ? { ...w, checked: at } : w));
    if (kept.length !== (cursor.wanted ?? []).length || due.length) state.set(project.projectId, { ...state.get(project.projectId), wanted: kept });
  }

  async function pushProject(project: SharedProjectRef, me: string) {
    const cursor = state.get(project.projectId);
    const { lines, end } = disk.readLinesFrom(project.dir, cursor.pushedTo);
    const mine = lines.filter((l) => l && (!l.by || l.by === me)).map((l) => adopt(l, me));
    let pushed = 0;
    if (mine.length) pushed = await backend.pushLines(project.projectId, mine);
    state.set(project.projectId, { ...state.get(project.projectId), pushedTo: end });
    return pushed;
  }

  async function pullProject(project: SharedProjectRef, me: string) {
    let pulled = 0;
    for (;;) {
      const cursor = state.get(project.projectId);
      const rows = await backend.pullLines(project.projectId, cursor.pulledSeq, PAGE);
      if (!rows.length) break;
      const direct = project.direct === true;
      // A list of files is for this step and goes no further: it is not
      // something said, so it never reaches the ledger.
      const lists = rows.map((r) => r.line?.patch?.carries).filter(Array.isArray);
      if (direct && lists.length && backend.getFile) await carrierFor(project).take(lists.flat());
      // A teammate's words that name a file, before its list has come: the tile
      // says it is on its way, and for whom.
      if (direct && backend.getFile) {
        const carrier = carrierFor(project);
        for (const row of rows) {
          const l = row.line;
          if (!l || !l.by || l.by === me || l.patch?.carries) continue;
          for (const text of wordsOfLine(l)) for (const { ref } of namedFiles(text)) carrier.expect(ref, l.by, l.ts);
        }
      }
      const bring = rows.map((r) => r.line).filter((l): l is LedgerLine => !!l && !l.patch?.carries)
        // A line of your own comes back only in a conversation, and a line of a
        // teammate's keeps only what they may set here (shared/team-rules.mts).
        .map((l) => (l.by === me ? whatYourOtherCopyMaySet(l, { direct }) : whatATeammateMaySet(l, { direct })))
        .filter(Boolean) as LedgerLine[];
      // The pictures first, so no message lands without its own.
      if (direct) await takeFiles(project, bring.flatMap(filesNamedIn));
      pulled += disk.appendForeignLines(project.dir, bring);
      // Lines pulled in move the file's end, but they were never ours to push,
      // and a push cursor left behind them would only re-read and skip them.
      const after = state.get(project.projectId);
      state.set(project.projectId, { ...after, pulledSeq: rows[rows.length - 1].seq });
      if (rows.length < PAGE) break;
    }
    return pulled;
  }

  // YOUR THREADS AS THE TEAM SEES THEM. Published only when they changed, so a
  // quiet Mac costs the cloud nothing on each pass.
  async function publishCards() {
    const teamId = teamIdOf?.();
    if (!teamId) return false;
    const cards = (listCards() || []).slice().sort((a, b) => a.threadId.localeCompare(b.threadId));
    const hash = crypto.createHash('sha256').update(teamId + JSON.stringify(cards)).digest('hex');
    if (hash === state.getCardsHash()) return false;
    await backend.putCards(teamId, cards);
    state.setCardsHash(hash);
    return true;
  }

  async function run() {
    const me = backend.personId ?? (await backend.me())?.id;
    if (!me) throw new Error('nobody is signed in');
    const report: SyncReport = { joined: [], notJoined: 0, pushed: 0, pulled: 0, cards: false };

    const cloudProjects = await backend.listProjects();
    const local = new Map(listShared().map((p) => [p.projectId, p]));
    for (const project of cloudProjects) {
      if (local.has(project.id)) continue;
      if (local.size >= MAX_SHARED_PROJECTS) { report.notJoined += 1; continue; }
      const joined = await joinProject(project);
      if (joined) { local.set(project.id, joined); report.joined.push(project.name); }
    }

    for (const project of cloudProjects) {
      const here = local.get(project.id);
      if (!here) continue;
      if (here.direct === true) { await sendFiles(here, me); await sendCarried(here, me); }
      report.pushed += await pushProject(here, me);
      report.pulled += await pullProject(here, me);
      if (here.direct === true) await takeWanted(here);
    }

    report.cards = await publishCards();
    // After the cards: the cloud takes a thread's work only while it has a card.
    await threadShare?.pass(teamIdOf?.());
    return report;
  }

  return {
    retryCarried,
    // One pass at a time: a second call while one runs waits for it and then
    // runs again, so a change that lands mid-pass is never left behind.
    async syncOnce() {
      while (running) await running.catch(() => {});
      running = run();
      try { return await running; } finally { running = null; }
    },
  };
}

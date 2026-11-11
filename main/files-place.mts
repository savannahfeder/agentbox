// THE FILES PLACE: every file a person may read, by project, each one file
// whatever threads and chats it went to. A file is its name's family of
// versions within a project (shared/artifact-marks.mts); its comments and
// approvals are those made on any copy of it. Only the threads the caller
// lists are read: your own, and the teammates' threads the cloud shows you.
import fs from 'node:fs';
import path from 'node:path';
import { resolveArtifact } from './artifact-path.mts';
import { approvalId, baseName, editedWords, familyName, familyOfName, filesInLines, marksOf, MAX_EDIT_BYTES, otherFilesInLines, otherKind, reviewKind, shownName, threadFiles, viewKind } from '../shared/artifact-marks.mts';
import { saveNextVersion } from './file-version.mts';
import { versionLine } from './version-line.mts';
import { cleanFolderName, fileKeyIn, folderNamed, foldFolders, newFolderId, readFolderLog, writeFolderLog } from '../shared/file-folders.mts';
import { projectSeenBy } from '../shared/thread-cards.mts';
import { shownTitle } from '../shared/thread-title.mts';
import { FILE_HOME, isFileHome } from '../shared/file-home.mts';
import type { FileApproval, FileFamily, FileLine, FileMarks, FileNote, Mark, MarkEntry, ThreadLine, ViewKind } from '../shared/artifact-marks.mts';
import type { FileFolder, FolderShelf } from '../shared/file-folders.mts';
import type { ArtifactProduct } from './artifact-path.mts';
import type { LineVersion, VersionLine } from './version-line.mts';
import type { SavedVersion } from './file-version.mts';
import type { Store, StoreProduct } from './store.mts';
import type { createTeamService } from './team/index.mts';

type FilesTeam = ReturnType<typeof createTeamService>;
type TeamNow = Partial<ReturnType<FilesTeam['state']>>;

interface CloudFolder extends FileFolder { people?: string[] | null }
interface CloudPlace { owner: string; threadId: string; project: string; family: string; folder: string | null; at: number; by?: string | null }
interface CloudShelf { folders: CloudFolder[]; places: CloudPlace[] }

export type ThreadRef =
  | { kind: 'thread' | 'chat'; product: string; id: string; ownerId?: undefined; threadId?: undefined; roomId?: undefined }
  | { kind: 'shared'; ownerId: string; threadId: string; product?: string | null; id?: undefined; roomId?: undefined }
  | { kind: 'room'; roomId: string; product?: undefined; id?: undefined; ownerId?: undefined; threadId?: undefined };

type RefKind = ThreadRef['kind'];

export interface PlaceThread {
  ref: ThreadRef;
  title: string;
  project: string | null;
  lines: readonly ThreadLine[];
  dirs?: string[];
  home?: boolean;
}

interface Copy { thread: PlaceThread; family: FileFamily; marks: FileMarks }

interface GroupedFile { key: string; project: string | null; familyKey: string; copies: Copy[] }

export interface ChainCopy { thread: PlaceThread; path: string; at: number }

export interface ChainVersion {
  id: string;
  name: string;
  n: number;
  at: number;
  by: string | null;
  agent?: string;
  edited?: boolean;
  made?: boolean;
  copies: ChainCopy[];
}

export interface LinedVersion extends ChainVersion { opened: string | null; pending?: boolean; blank?: boolean }

export type PlacedNote = FileNote & { thread: PlaceThread };
export type PlacedApproval = FileApproval & { thread: PlaceThread };

export interface PlacedFile {
  key: string;
  project: string | null;
  name: string;
  kind: ViewKind | null;
  versions: number;
  at: number;
  by: string | null;
  agent?: string;
  open: number;
  approvedBy: (string | null)[];
  approved: { by: string | null; at: number }[];
  changedSinceApproval?: { by: string | null; approvedBy: string | null };
  sentIn: Array<ThreadRef & { title: string }>;
  chain: ChainVersion[];
  notes: PlacedNote[];
  approvals: PlacedApproval[];
  seen: Record<string, string[]>;
}

export type LinedFile = Omit<PlacedFile, 'chain'> & { chain: LinedVersion[]; blank?: boolean };

interface FileBytes { size: number; mtime: number; hash: string }

interface CopyOnDisk { f: PlacedFile; v: ChainVersion; c: ChainCopy; bytes: FileBytes }

type HistoryReader = (id: string, o: { max?: number }) => readonly ThreadLine[];

export type ListedFile = Omit<LinedFile, 'chain' | 'notes' | 'approvals' | 'seen'> & { folder: string | null; folderFollows?: boolean; opened: string | null };

export type MarkAnswer =
  | { ok: true; wrote?: { product: string; id: string } }
  | { ok: false; error: string };

export interface FileElsewhere {
  key: string | null;
  notes: Array<FileNote & { in: string; key: string }>;
  approvals: Array<FileApproval & { key: string }>;
}

export type EditAnswer =
  | { ok: true; goes?: 'sent'; to?: string; path?: string }
  | { ok: false; error: string };

export interface FilesList { files: ListedFile[]; projects: string[]; folders: FileFolder[]; mine: string[] }

type MadeKind = 'document' | 'table';

type RoomPut = { ok?: boolean; error?: string };

const entriesOf = (lines: readonly ThreadLine[] | null | undefined): MarkEntry[] => (lines ?? []).filter((l) => l?.patch?.artifact)
  .map((l) => ({ ...l.patch!.artifact, by: l.by ?? null, ts: l.ts, uid: l.uid ?? null }));

const projectKey = (name: string | null | undefined): string => String(name ?? '').trim().toLowerCase();
// A family key holds a \0, which Postgres text cannot.
const toCloudFamily = (family: string): string => family.split('\0').map(encodeURIComponent).join('/');
const fromCloudFamily = (family: unknown): string => String(family).split('/').map(decodeURIComponent).join('\0');
const CROSS_EVERY_MS = 10_000;
// What New makes, and what it starts with: a table needs its columns to be typed into.
const MADE: Record<MadeKind, { ext: string; seed: string }> = { document: { ext: '.md', seed: '' }, table: { ext: '.csv', seed: 'Name,Notes\n' } };
const SEED_OF = new Map(Object.values(MADE).map((m) => [m.ext, m.seed]));
/** Whether the file at `src` is still exactly what New started it with. */
async function untouched(src: string): Promise<boolean> {
  const seed = SEED_OF.get(path.extname(src).toLowerCase());
  if (seed === undefined) return false;
  const st = await fs.promises.stat(src).catch(() => null);
  if (!st || st.size !== Buffer.byteLength(seed)) return false;
  return (await fs.promises.readFile(src, 'utf8').catch(() => null)) === seed;
}
const FILES_FOR_AGENTS = 40;

/**
 * Threads to files. A thread is `{ ref, title, project, lines }`, where `ref`
 * says how to reach it (`kind` thread, chat or shared) and `project` is a
 * project's name, null for a chat. A chat's copy joins the project file of the
 * same name, as the agent's tools match it (mcp/core/reach.mts).
 */
/** Counts for tests: how many threads were parsed for their files. */
export const filesOfInternals = { parses: 0, entries: 0, lists: 0 };

// Every list of Files reads every thread, so a thread is parsed again only when
// its lines did: one agent writing must not re-read thousands of threads.
const PARSED_KEEP = 20000;
const parsed = new Map<string, { families: FileFamily[]; marks: FileMarks }>();
const refKey = (r: ThreadRef): string => `${r.kind}:${r.ownerId ?? r.product ?? ''}:${r.threadId ?? r.id ?? r.roomId ?? ''}`;
const linesKey = (lines: readonly ThreadLine[]): string => { const last = lines.at(-1); return `${lines.length}#${last?.ts ?? ''}#${JSON.stringify(last?.patch ?? last ?? null)?.length ?? 0}`; };

export function filesOf(threads: readonly PlaceThread[]): PlacedFile[] {
  const files = new Map<string, GroupedFile>();
  const add = (key: string, project: string | null, family: FileFamily, thread: PlaceThread, marks: FileMarks): void => {
    let f = files.get(key);
    if (!f) { f = { key, project, familyKey: family.key, copies: [] }; files.set(key, f); }
    f.copies.push({ thread, family, marks });
  };
  // A teammate's words relayed to an agent name a file of their conversation, never of this thread.
  const ownLines = (t: PlaceThread): ThreadLine[] => t.lines.filter((l) => !(l?.source === 'system' && l.patch?.from));
  const read = (t: PlaceThread): { families: FileFamily[]; marks: FileMarks } => {
    const key = `${refKey(t.ref)}@${linesKey(t.lines)}`;
    const had = parsed.get(key);
    if (had) return had;
    filesOfInternals.parses += 1;
    const out = { families: threadFiles([...filesInLines(ownLines(t)), ...otherFilesInLines(ownLines(t))]), marks: marksOf(entriesOf(t.lines)) };
    if (parsed.size >= PARSED_KEEP) parsed.delete(parsed.keys().next().value!);
    parsed.set(key, out);
    return out;
  };
  const chats: Array<{ t: PlaceThread; families: FileFamily[]; marks: FileMarks }> = [];
  const named: Named[] = [];
  for (const t of threads) {
    const { families, marks } = read(t);
    if (!families.length) continue;
    if (t.ref.kind === 'chat' || t.ref.kind === 'room') { chats.push({ t, families, marks }); continue; }
    for (const fam of families) named.push({ t, fam, marks });
  }
  // Only a file of the same name can be another thread's home for it. Oldest
  // first, so the first thread that qualifies is the oldest one.
  const sameName = new Map<string, Named[]>();
  for (const e of named) {
    const list = sameName.get(e.fam.key);
    if (list) list.push(e); else sameName.set(e.fam.key, [e]);
  }
  for (const list of sameName.values()) list.sort((a, b) => firstAt(a.fam) - firstAt(b.fam));
  for (const e of named) {
    const project = homeElsewhere(e, sameName.get(e.fam.key)!) ?? e.t.project;
    add(`${projectKey(project)}\0${e.fam.key}`, project, e.fam, e.t, e.marks);
  }
  const inProjects = new Map<string, GroupedFile[]>();
  for (const f of files.values()) {
    if (!f.project) continue;
    const list = inProjects.get(f.familyKey);
    if (list) list.push(f); else inProjects.set(f.familyKey, [f]);
  }
  for (const { t, families, marks } of chats) {
    for (const fam of families) {
      const same = inProjects.get(fam.key) ?? [];
      if (same.length) for (const f of same) add(f.key, f.project, fam, t, marks);
      else add(`\0${fam.key}`, null, fam, t, marks);
    }
  }
  return [...files.values()].map(summary).sort((a, b) => b.at - a.at);
}

const COPY_PATH = /^sources\/[^/]+\/[^/]+$/;
const firsts = new WeakMap<FileFamily, number>();
const firstAt = (fam: FileFamily): number => {
  if (!firsts.has(fam)) firsts.set(fam, Math.min(...fam.versions.map((v) => v.at || 0)));
  return firsts.get(fam)!;
};
const idSets = new WeakMap<FileFamily, Set<string>>();
const idsOf = (fam: FileFamily): Set<string> => {
  if (!idSets.has(fam)) idSets.set(fam, new Set(fam.versions.map((v) => v.id)));
  return idSets.get(fam)!;
};

interface Named { t: PlaceThread; fam: FileFamily; marks: FileMarks }

/**
 * The project whose file a thread's family belongs to when that is not the
 * thread's own: the thread names a version another project's file holds, and
 * either it is a kept copy of a connection, or this thread's version of that
 * name is not on its own disk (so it read the other file) and the thread adds
 * a version or can say so. Only an older file is joined, so two never swap.
 * `named` is oldest first, so the first that qualifies is the answer.
 */
function homeElsewhere({ t, fam }: Named, named: readonly Named[]): string | null {
  const here = new Map<string, boolean>();
  const ownHere = (v: { path: string }): boolean => {
    if (!here.has(v.path)) here.set(v.path, (t.dirs ?? []).some((d) => d && !path.isAbsolute(v.path) && fs.existsSync(path.join(d, v.path))));
    return here.get(v.path)!;
  };
  const mine = firstAt(fam);
  const home = projectKey(t.project);
  let allHere: boolean | undefined;
  for (const o of named) {
    if (firstAt(o.fam) > mine) break;
    if (o.t === t || o.fam.key !== fam.key || projectKey(o.t.project) === home) continue;
    const ids = idsOf(o.fam);
    const shared = fam.versions.filter((v) => ids.has(v.id));
    if (!shared.length) continue;
    const copy = shared.some((v) => COPY_PATH.test(v.path) && o.fam.versions.some((x) => x.path === v.path));
    if (!copy) {
      // Every version on this thread's own disk and none a copy: no other thread can take it.
      allHere ??= !fam.versions.some((v) => COPY_PATH.test(v.path)) && fam.versions.every(ownHere);
      if (allHere) return null;
    }
    const revised = fam.versions.some((v) => !ids.has(v.id) && v.name !== baseName(v.name));
    if (!copy && (shared.some(ownHere) || !(revised || t.dirs?.length))) continue;
    return o.t.project;
  }
  return null;
}

// What the copy of a connection's item is named on disk carries its id, to keep two items apart.
const COPY_ID_TAIL = /-(?:[0-9a-f]{8}|\d{6,})(\.md)$/;
const copyTitle = (name: string, chain: readonly ChainVersion[]): string => (chain.every((v) => v.copies.every((c) => COPY_PATH.test(c.path))) ? name.replace(COPY_ID_TAIL, '$1') : name);

// A copy in your own thread is where a new comment goes, so the agent that made it
// reads it there; a teammate's thread next, which reaches its owner; a chat last.
const PREFER: Record<RefKind, number> = { thread: 0, shared: 1, chat: 2, room: 3 };
// An edit goes where its people will read it: a chat reaches only the one person in it.
const EDITS_GO: Record<RefKind, number> = { thread: 0, shared: 1, room: 2, chat: 3 };

/**
 * The thread an edit of this file lands on. A file a group made, the Team look
 * above all, is edited in the group even where a thread links it: the group's
 * version is the one everybody and every agent reads, and a teammate's thread
 * would hold the words until their computer took them.
 */
export function whereEditsGo(chain: readonly ChainVersion[]): PlaceThread | null {
  const first = [...(chain[0]?.copies ?? [])].sort((a, b) => (a.at || 0) - (b.at || 0))[0];
  if (first?.thread.ref.kind === 'room') return first.thread;
  const places = [...new Set(chain.flatMap((v) => v.copies.map((c) => c.thread)))];
  return places.sort((a, b) => EDITS_GO[a.ref.kind] - EDITS_GO[b.ref.kind])[0] ?? null;
}

// Each person's newest approval of any version.
function newestEach(approvals: readonly FileApproval[]): { by: string | null; at: number }[] {
  const by = new Map<string | null, { by: string | null; at: number }>();
  // undefined >= ts is false, so a first approval is always kept.
  for (const a of approvals) if (!((by.get(a.by)?.at as number) >= a.ts)) by.set(a.by, { by: a.by ?? null, at: a.ts || 0 });
  return [...by.values()];
}

function summary(f: GroupedFile): PlacedFile {
  const versions = new Map<string, Omit<ChainVersion, 'n'>>();
  const notes: PlacedNote[] = [];
  const approvals: PlacedApproval[] = [];
  const seen: Record<string, string[]> = {};
  for (const c of [...f.copies].sort((a, b) => PREFER[a.thread.ref.kind] - PREFER[b.thread.ref.kind])) {
    const ids = new Set(c.family.versions.map((v) => v.id));
    // A teammate's copy publishes its agent's lines with no author: they are its owner's.
    const ownerOf = c.thread.ref.kind === 'shared' ? c.thread.ref.ownerId : null;
    for (const v of c.family.versions) {
      const was = versions.get(v.id);
      if (!was) versions.set(v.id, { id: v.id, name: v.name, at: v.at, by: v.by ?? ownerOf, ...(typeof v.agent === 'string' ? { agent: v.agent } : {}), ...(v.edited ? { edited: true } : c.thread.home ? { made: true } : {}), copies: [{ thread: c.thread, path: v.path, at: v.at || 0 }] });
      else { was.copies.push({ thread: c.thread, path: v.path, at: v.at || 0 }); if (v.at && (!was.at || v.at < was.at)) was.at = v.at; }
    }
    // `deck.pdf@3` is a version by its number on the line, which a thread may not hold itself.
    const onIt = (file: string): boolean => ids.has(file) || (/@\d+$/.test(file) && familyOfName(file.replace(/@\d+$/, '')) === c.family.key);
    for (const n of c.marks.notes) if (onIt(n.file)) notes.push({ ...n, thread: c.thread });
    for (const a of c.marks.approvals) if (onIt(a.file)) approvals.push({ ...a, thread: c.thread });
    for (const [who, list] of Object.entries(c.marks.seen ?? {})) seen[who] = [...new Set([...(seen[who] ?? []), ...list])];
  }
  const chain = [...versions.values()].sort((a, b) => (a.at || 0) - (b.at || 0)).map((v, i): ChainVersion => ({ ...v, n: i + 1 }));
  const newest = chain[chain.length - 1];
  const stoodApproved = newest.edited && !approvals.some((a) => a.file === newest.id)
    ? approvals.filter((a) => chain.some((v) => v.id === a.file)).sort((a, b) => a.ts - b.ts).at(-1) : null;
  const places = [...new Set(f.copies.map((c) => c.thread))];
  return {
    key: f.key,
    project: f.project,
    name: copyTitle(familyName({ versions: chain }, newest), chain),
    kind: reviewKind(newest.copies[0].path) ?? otherKind(newest.copies[0].path),
    versions: chain.length,
    at: newest.at || 0,
    by: newest.by ?? null,
    ...(typeof newest.agent === 'string' ? { agent: newest.agent } : {}),
    open: notes.filter((n) => !n.resolved).length,
    approvedBy: [...new Set(approvals.filter((a) => a.file === newest.id).map((a) => a.by))],
    approved: newestEach(approvals),
    ...(stoodApproved ? { changedSinceApproval: { by: newest.by ?? null, approvedBy: stoodApproved.by ?? null } } : {}),
    sentIn: places.filter((t) => !t.home).map((t) => ({ ...t.ref, title: t.title })),
    chain, notes, approvals, seen,
  };
}

/** What the big view draws: one line per version, every comment from every copy. */
function viewOf(file: LinedFile, opened: Map<string, string>) {
  const lines = file.chain.map((v): ThreadLine => (v.edited
    ? { ts: v.at, by: v.by, source: 'founder', patch: { artifact: { do: 'edit', file: v.id, path: opened.get(v.id) } } }
    : {
      ts: v.at, by: v.by, source: typeof v.agent === 'string' ? 'agent' : 'system',
      patch: { note: `[${v.name}](${opened.get(v.id)})`, ...(v.agent ? { voice: { name: v.agent } } : {}), ...(v.made ? { made: true } : {}) },
    }));
  const many = file.sentIn.length > 1;
  // Each copy numbers its own pins from 1; here they are one file's pins.
  const pins = new Map<string, number>();
  const notes = [...file.notes].sort((a, b) => a.ts - b.ts).map(({ thread, ...n }) => {
    const out: FileNote & { in?: string } = { ...n, ...(many ? { in: thread.title } : {}) };
    if (n.place?.kind === 'pin' || typeof n.place?.x === 'number') { const k = (pins.get(n.file) ?? 0) + 1; pins.set(n.file, k); out.pin = k; }
    return out;
  });
  const editsTo = whereEditsGo(file.chain);
  return {
    key: file.key, project: file.project, name: file.name, kind: file.kind, sentIn: file.sentIn,
    editsTo: editsTo ? { ...editsTo.ref, title: editsTo.title } : null,
    versions: file.chain.map((v) => ({ id: v.id, name: v.name, n: v.n, at: v.at, by: v.by })),
    lines,
    marks: { notes, approvals: file.approvals.map(({ thread: _t, ...a }) => a), seen: file.seen },
  };
}

/** The store and the team, as the Files place reads them. */
export function appFilesPlace({ store, team = null, accountRoot, storeRoot, notify = () => {} }: {
  store: Store;
  team?: FilesTeam | null;
  accountRoot?: string | null;
  storeRoot: string;
  notify?: () => void;
}) {
  const built = new Map<string, { version: unknown; lines: readonly ThreadLine[] }>();
  const logDir = (): string => store.teammates?.dir?.() ?? storeRoot;
  let held: CloudShelf = { folders: [], places: [] };
  let crossingNow: Promise<void> | null = null;
  let lastCrossed = 0;
  const familyIn = (key: string): string => key.slice(key.indexOf('\0') + 1);

  // What this copy has said and what the cloud holds, newest word winning.
  function shelf(): FolderShelf {
    return foldFolders([
      ...readFolderLog(logDir()),
      ...held.folders.map((f) => ({ op: 'folder' as const, ...f })),
      ...held.places.map((p) => ({ op: 'place' as const, key: `${projectKey(p.project)}\0${fromCloudFamily(p.family)}`, ...p })),
    ]);
  }

  /** null is the whole team, a list is chosen people, 'private' never leaves this computer. */
  function audienceOf(project: string | null): 'private' | Array<string | undefined> | null {
    const state: TeamNow = team?.state?.() ?? {};
    const me = state.me?.id;
    const key = projectKey(project);
    const mine = store.listProducts().find((p) => !p.team?.direct && projectKey(p.name) === key);
    if (mine) {
      const seen = projectSeenBy(mine);
      if (seen.who === 'private') return 'private';
      return seen.who === 'people' ? [...new Set([...seen.people, me])] : null;
    }
    // A teammate's project is known here only by the cards it shows this person.
    const cards = (state.cards ?? []).filter((c) => projectKey(c.project as string | null | undefined) === key);
    if (!cards.length) return 'private';
    if (cards.some((c) => c.people == null)) return null;
    return [...new Set(cards.flatMap((c): Array<string | undefined> => [...(c.people as string[]), c.personId]).concat(me))];
  }

  // The threads the cloud shows a card for: a place on any other names a file
  // somebody may not be allowed to know about.
  function anchorsOf(file: PlacedFile, state: TeamNow): Array<{ owner: string; threadId: string }> {
    const cards = new Set((state.cards ?? []).map((c) => `${c.personId}/${c.threadId}`));
    const out: Array<{ owner: string; threadId: string }> = [];
    for (const s of file.sentIn) {
      const owner = s.kind === 'shared' ? s.ownerId : s.kind === 'thread' ? state.me?.id : null;
      const threadId = s.kind === 'shared' ? s.threadId : s.id;
      // Only a thread or a shared thread has an owner, and both name their thread.
      if (owner && cards.has(`${owner}/${threadId}`)) out.push({ owner, threadId: threadId! });
    }
    return out;
  }

  async function crossOnce(): Promise<void> {
    const cloud = team?.fileFolders?.();
    if (!cloud) return;
    const before = JSON.stringify(held);
    const moved = await lineNow().refresh().catch((err: Error) => { console.warn(`files: the version line did not cross: ${err.message}`); return false; });
    held = await cloud.read() as CloudShelf;
    const state = team!.state();
    const local = foldFolders(readFolderLog(logDir()));
    const seenFolder = new Map(held.folders.map((f): [string, CloudFolder] => [f.id, f]));
    let wrote = false;
    const quietly = async (what: string, fn: () => Promise<unknown>): Promise<void> => {
      try { await fn(); wrote = true; } catch (err) { console.warn(`files: ${what}: ${(err as Error).message}`); }
    };
    for (const f of local.folders) {
      const was = seenFolder.get(f.id);
      if (was && was.at >= f.at) continue;
      const people = was ? was.people : audienceOf(f.project);
      if (people === 'private') continue;
      await quietly('sending a folder', () => cloud.putFolder({ id: f.id, project: f.project, name: f.name, parent: f.parent, people, at: f.at }));
    }
    if (wrote) held = await cloud.read() as CloudShelf;
    const merged = shelf();
    const readable = new Set(held.folders.map((f) => f.id));
    const files = allFiles();
    for (const [key, p] of local.places) {
      const file = files.find((f) => f.key === key);
      const folder = p.folder ? merged.canon(p.folder) : null;
      if (!file || (folder && !readable.has(folder))) continue;
      const family = toCloudFamily(familyIn(key));
      for (const { owner, threadId } of anchorsOf(file, state)) {
        const was = held.places.find((x) => x.owner === owner && x.threadId === threadId && x.family === family);
        if (was && was.at >= p.at) continue;
        await quietly('saying where a file sits', () => cloud.place(owner, threadId, { project: p.project, family, folder, at: p.at }));
      }
    }
    if (wrote) held = await cloud.read() as CloudShelf;
    if (moved || JSON.stringify(held) !== before) notify();
  }

  /** One pass of folders and places to and from the cloud. A pass that fails is the next pass's to do. */
  async function crossing(): Promise<void> {
    while (crossingNow) await crossingNow;
    lastCrossed = Date.now();
    crossingNow = crossOnce().catch((err: Error) => { console.warn(`files: folders did not cross: ${err.message}`); }).finally(() => { crossingNow = null; });
    return crossingNow;
  }
  const crossSoon = () => { if (!crossingNow && Date.now() - lastCrossed > CROSS_EVERY_MS) void crossing(); };

  const historyOf = (key: string, version: unknown, read: () => readonly ThreadLine[]): readonly ThreadLine[] => {
    const was = built.get(key);
    if (was && was.version === version) return was.lines;
    const lines = read();
    built.set(key, { version, lines });
    return lines;
  };
  const readable = (): ArtifactProduct[] => [...store.listProducts(), ...(team?.sharedThreadProducts?.() ?? [])];

  // A thread's entry and its part of allFiles' signature, kept while its lines
  // and its project are the same objects and names they were.
  const entries = new Map<string, { entry: PlaceThread; lines: readonly ThreadLine[]; name: string; dir: string; repo: string | null }>();
  const sigs = new WeakMap<PlaceThread, string>();
  const sigOf = (t: PlaceThread): string => sigs.get(t) ?? `${refKey(t.ref)}@${linesKey(t.lines)}|${t.title}|${t.project}|${(t.dirs ?? []).join(',')}`;

  function threads(): PlaceThread[] {
    const state: TeamNow = team?.state?.() ?? {};
    const me = state.me?.id ?? null;
    const firstOf = (id: string): string => (state.people ?? []).find((p) => p.id === id)?.name?.split(/\s+/)[0] ?? 'someone';
    const out: PlaceThread[] = [];
    const bySlug = new Map(store.listProducts().map((p): [string, StoreProduct] => [p.slug, p]));
    const readers = new Map<string, HistoryReader>();
    const readerOf = (slug: string): HistoryReader => {
      if (!readers.has(slug)) readers.set(slug, store.historyReader?.(slug) ?? ((id: string, o: { max?: number }) => store.readHistory(slug, id, o)));
      return readers.get(slug)!;
    };
    for (const item of store.listAllWorkItems()) {
      const product = bySlug.get(item.product);
      if (!product) continue;
      const chat = !!product.team?.direct;
      const key = `${product.slug}/${item.id}`;
      const lines = historyOf(key, item.updatedAt, () => readerOf(product.slug)(item.id, { max: Number.MAX_SAFE_INTEGER }));
      const was = chat ? null : entries.get(key);
      if (was && was.lines === lines && was.name === product.name && was.dir === product.dir && was.repo === product.repoPath) {
        out.push(was.entry);
        continue;
      }
      filesOfInternals.entries += 1;
      // The receiving copy lists everyone but the one who started the chat.
      const others = [...new Set([...(product.team?.people ?? []), product.team?.sharedBy, ...(item.people ?? [])])].filter((p) => p && p !== me) as string[];
      const entry: PlaceThread = {
        ref: { kind: chat ? 'chat' : 'thread', product: product.slug, id: item.id },
        title: chat ? `Chat with ${others.map(firstOf).join(', ') || 'yourself'}` : shownTitle(item),
        project: chat ? null : product.name,
        dirs: chat ? [] : [product.dir, product.repoPath, product.repoPath ? path.join(product.repoPath, '.claude', 'worktrees', item.id) : null].filter(Boolean) as string[],
        lines,
        ...(isFileHome(item) ? { home: true } : {}),
      };
      if (!chat) {
        sigs.set(entry, sigOf(entry));
        entries.set(key, { entry, lines, name: product.name, dir: product.dir, repo: product.repoPath });
      }
      out.push(entry);
    }
    const cards = new Map((state.cards ?? []).map((c) => [`${c.personId}/${c.threadId}`, c] as const));
    for (const s of team?.sharedThreads?.() ?? []) {
      const card = cards.get(`${s.ownerId}/${s.threadId}`);
      if (!card) continue;
      const work = team!.threadWork(s.ownerId, s.threadId);
      if (!work?.shared) continue;
      out.push({
        ref: { kind: 'shared', ownerId: s.ownerId, threadId: s.threadId, product: work.product },
        title: (card.title as string | undefined) ?? 'Thread', project: (card.project as string | undefined) ?? null, lines: work.lines,
      });
    }
    const groups = state.rooms;
    for (const room of groups?.rooms ?? []) {
      const said = (groups!.messages?.[room.id] ?? []).filter((m) => !m.deleted)
        .map((m): ThreadLine => ({ id: m.id, ts: m.at, by: m.by, source: 'founder', patch: { body: m.body } }));
      const marked = (groups!.fileMarks?.[room.id] ?? [])
        .map((m): ThreadLine => ({ id: m.id, ts: m.at, by: m.by, source: 'system', patch: { artifact: m.mark as Mark } }));
      out.push({ ref: { kind: 'room', roomId: room.id }, title: room.name || 'Group', project: null, lines: [...said, ...marked] });
    }
    return out;
  }

  // The same threads give the same files: an open thread asks on every change in the app.
  let last: { sig: string | null; files: PlacedFile[] } = { sig: null, files: [] };
  const allFiles = (): PlacedFile[] => {
    const ts = threads();
    const sig = ts.map(sigOf).join('\n');
    if (sig !== last.sig) last = { sig, files: filesOf(ts) };
    return last.files;
  };
  const find = (key: string): PlacedFile | null => allFiles().find((f) => f.key === key) ?? null;

  const onDisk = async (src: string, product: string | null | undefined, thread: string | null = null, products: ArtifactProduct[] = readable()): Promise<string | null> => {
    const found = await resolveArtifact({ src, product, products, accountRoot, storeRoot, thread });
    return found.ok ? found.path : null;
  };

  // An open file asks for every copy it names on each change in the app, so a
  // project's copies are found and hashed once per state of the threads.
  let copiesFor: { files: PlacedFile[] | null; products: ArtifactProduct[] | null; byProject: Map<string, Promise<CopyOnDisk[]>> } = { files: null, products: null, byProject: new Map() };
  const copiesNow = (files: PlacedFile[]) => {
    if (copiesFor.files !== files) copiesFor = { files, products: readable(), byProject: new Map() };
    return copiesFor;
  };
  function copiesIn(files: PlacedFile[], project: string | null): Promise<CopyOnDisk[]> {
    const { products, byProject } = copiesNow(files);
    const key = projectKey(project);
    if (!byProject.has(key)) {
      byProject.set(key, (async () => {
        const out: CopyOnDisk[] = [];
        for (const f of files) {
          if (projectKey(f.project) !== key) continue;
          for (const v of f.chain) {
            for (const c of v.copies) {
              // copiesNow read the products when it took these files.
              const there = await onDisk(c.path, c.thread.ref.product, null, products!);
              const bytes = there && await bytesOf(there).catch(() => null);
              if (bytes) out.push({ f, v, c, bytes });
            }
          }
        }
        return out;
      })());
    }
    return byProject.get(key)!;
  }
  const nameInRoom = (src: string): string => String(src).replace(/^\.?\/?attachments\//, '');
  // A group's file may still be in the cloud, and drawing the list fetches nothing.
  async function openedOf(file: PlacedFile | LinedFile, v: ChainVersion, { fetch = false, products = readable() }: { fetch?: boolean; products?: ArtifactProduct[] } = {}): Promise<string | null> {
    for (const c of v.copies) {
      const { ref } = c.thread;
      // A group's thread is only listed when the team has its rooms.
      const found = ref.kind === 'room'
        ? await (fetch ? team!.rooms!.fileOnDisk(ref.roomId, nameInRoom(c.path)).catch(() => null) : team!.rooms!.fileIfKept(ref.roomId, nameInRoom(c.path)))
        : await onDisk(c.path, ref.product, ref.kind === 'thread' ? ref.id : null, products);
      if (found) return found;
    }
    return null;
  }
  const lines = new Map<string, VersionLine>();
  const lineNow = (): VersionLine => {
    const dir = path.join(logDir(), '.file-versions');
    if (!lines.has(dir)) lines.set(dir, versionLine({ dir, cloud: () => team?.fileVersions?.() ?? null, onMoved: notify }));
    return lines.get(dir)!;
  };

  /**
   * A file's versions as its line numbers them. Every copy here joins the line
   * first, so new bytes at an old path are the next version and the old ones
   * stay kept. A version is matched to the line by its bytes, or by its name
   * when its bytes are on another computer; a name the line never had (an
   * agent's shorthand, a file only promised) is no version. `same` maps every
   * other id a version went by to the one it is shown under.
   */
  async function lineChain(f: PlacedFile | LinedFile, shared: boolean = audienceOf(f.project) !== 'private', products: ArtifactProduct[] = readable()): Promise<{ chain: LinedVersion[]; same: Map<string, string> }> {
    const line = lineNow();
    const mine: Array<{ v: ChainVersion; src: string | null; entry: LineVersion | null; blank: boolean }> = [];
    // A file nothing was ever written in is no version yet: its first words are v1.
    const unwritten = f.chain.length === 1 && !line.of(f.key).length;
    for (const v of f.chain) {
      const src = await openedOf(f, v, { products });
      const blank = !!src && unwritten && await untouched(src);
      // A path is never the empty string, so `src &&` is null or the version.
      const entry = (src && !blank ? await line.add({ file: f.key, src, name: v.name, by: v.by ?? null, at: v.at || Date.now(), shared }) : null) as LineVersion | null;
      mine.push({ v, src, entry, blank });
    }
    const fallback = familyName({ versions: f.chain }, f.chain.at(-1));
    const chain: LinedVersion[] = [];
    const same = new Map<string, string>();
    for (const e of line.of(f.key)) {
      let held = mine.filter((m) => m.entry?.hash === e.hash);
      if (!held.length) held = mine.filter((m) => !m.entry && e.name && line.idOf(m.v.name) === e.name);
      const first = held[0]?.v;
      // A write over a path leaves its old bytes with no copy of their own; marks on them go where that path's do.
      const overwritten = first ? null : mine.find((m) => e.name && line.idOf(m.v.name) === e.name)?.v;
      const name = first?.name ?? (e.kept ? path.basename(e.kept) : overwritten?.name ?? fallback);
      const id = first?.id ?? `${baseName(name)}@${e.n}`;
      for (const m of held.slice(1)) same.set(m.v.id, id);
      chain.push({
        id, name, n: e.n, at: first?.at || e.at || 0, by: first?.by ?? e.by ?? null,
        ...(typeof first?.agent === 'string' ? { agent: first.agent } : {}),
        ...(first?.edited ? { edited: true } : first?.made ? { made: true } : {}),
        copies: held.flatMap((m) => m.v.copies).concat(first ? [] : overwritten?.copies ?? []),
        opened: held.find((m) => m.src && m.entry?.hash === e.hash)?.src ?? e.kept ?? null,
        ...(e.pending ? { pending: true } : {}),
      });
    }
    // A group's file not fetched yet is in the cloud's keeping: a version still to be numbered.
    const waiting = mine.filter((m) => !m.entry && !chain.some((v) => v.id === m.v.id || same.has(m.v.id)) && m.v.copies.some((c) => c.thread.ref.kind === 'room'));
    for (const { v } of waiting) chain.push({ ...v, n: chain.length + 1, opened: null, pending: true });
    const blank = mine.find((m) => m.blank);
    if (blank && !chain.length) chain.push({ ...blank.v, n: 1, opened: blank.src, blank: true });
    for (const v of chain) same.set(`${baseName(v.name)}@${v.n}`, v.id);
    return { chain, same };
  }
  const asOf = (row: PlacedFile | LinedFile, chain: LinedVersion[]): LinedFile => {
    const newest = chain[chain.length - 1];
    if (!newest) return { ...row, versions: 0, chain };
    const { agent: _agent, ...rest } = row;
    return {
      ...rest,
      name: copyTitle(familyName({ versions: chain }, newest), chain),
      versions: chain.length, at: newest.at || 0, by: newest.by ?? null,
      ...(typeof newest.agent === 'string' ? { agent: newest.agent } : {}),
      approvedBy: [...new Set(row.approvals.filter((a) => a.file === newest.id).map((a) => a.by))],
      ...(newest.blank ? { blank: true } : {}),
      chain,
    };
  };

  // A tile draws the newest version this computer has rather than nothing.
  async function faceOf(f: LinedFile, products: ArtifactProduct[] = readable()): Promise<string | null> {
    for (const v of [...f.chain].reverse()) {
      const found = v.opened ?? await openedOf(f, v, { products });
      if (found) return found;
    }
    return null;
  }

  // The version line saves its fingerprints, so a restart reads no film again.
  const bytesOf = (file: string): Promise<FileBytes | null> => lineNow().hashOf(file);

  // Shared and group threads are only listed with a team, and a group's only with its rooms.
  async function writeTo(thread: PlaceThread, mark: unknown): Promise<void> {
    if (thread.ref.kind === 'shared') await team!.markSharedFile(thread.ref.ownerId, thread.ref.threadId, mark);
    else if (thread.ref.kind === 'room') await team!.rooms!.markFile(thread.ref.roomId, mark);
    else store.fileMark(thread.ref.product, thread.ref.id, mark);
  }

  // Every change in the app asks for the list again. A list asked for while one
  // runs waits for it and reads once more, so they never pile up behind each other.
  let listing: Promise<FilesList> | null = null;
  let listAgain: Promise<FilesList> | null = null;
  function list(): Promise<FilesList> {
    if (!listing) {
      listing = listOnce().finally(() => { listing = null; });
      return listing;
    }
    listAgain ??= listing.catch(() => {}).then(() => { listAgain = null; return list(); });
    return listAgain;
  }

  async function listOnce(): Promise<FilesList> {
    filesOfInternals.lists += 1;
    crossSoon();
    const files = allFiles();
    const lib = shelf();
    const placed = [...lib.places.values()].filter((p) => p.folder);
    const threadOf = (ref: ThreadRef): string => `${ref.ownerId ?? ref.product}/${ref.threadId ?? ref.id}`;
    const onThreads = (f: Pick<PlacedFile, 'sentIn'>): string[] => f.sentIn.filter((s) => s.kind === 'thread' || s.kind === 'shared').map(threadOf);
    // Where a thread's files were put, so its next one lands beside them. Only
    // a file made since: tidying one of a thread's files must not move the rest.
    const homes = new Map<string, Array<{ folder: string; since: number }>>();
    for (const f of files) {
      const folder = lib.placeOf(f.key);
      if (!folder) continue;
      const since = lib.places.get(f.key)?.at ?? 0;
      for (const t of onThreads(f)) homes.set(t, [...(homes.get(t) ?? []), { folder, since }]);
    }
    const homeOf = (f: LinedFile): string | null => {
      if (!f.project || lib.places.has(f.key)) return null;
      const here = onThreads(f).flatMap((t) => homes.get(t) ?? []);
      const found = new Set(here.map((h) => h.folder));
      return found.size === 1 && here.every((h) => f.at > h.since) ? here[0].folder : null;
    };
    const sharedIn = new Map<string, boolean>();
    const isShared = (project: string | null): boolean => {
      const key = projectKey(project);
      if (!sharedIn.has(key)) sharedIn.set(key, audienceOf(project) !== 'private');
      return sharedIn.get(key)!;
    };
    // Read once for the pass: per version it was thousands of stats of every project folder.
    const products = readable();
    const lined: LinedFile[] = [];
    for (const whole of files) {
      const { chain } = await lineChain(whole, isShared(whole.project), products);
      if (chain.length) lined.push(asOf(whole, chain));
    }
    const rows = await Promise.all(lined.map(async (f) => {
      const { chain, notes: _n, approvals: _a, seen: _s, ...row } = f;
      // A file only a chat holds has no project until an agent files it in one.
      const filed = f.project ? null : placed.find((p) => familyIn(p.key) === familyIn(f.key));
      const project = f.project ?? filed?.project ?? null;
      const own = lib.placeOf(filed?.key ?? f.key);
      const beside = own ? null : homeOf(f);
      // Filed in another project's folder, it is listed where it was filed.
      const shownIn = lib.folders.find((x) => x.id === (own ?? beside))?.project ?? project;
      return { ...row, project: shownIn, folder: own ?? beside, ...(beside ? { folderFollows: true } : {}), opened: await faceOf(f, products) };
    })).then((all) => all.filter((f) => f.opened || (f.kind !== 'page' && f.kind !== 'code')));
    const projects: string[] = [];
    for (const name of [...rows.map((f) => f.project), ...lib.folders.map((f) => f.project)]) {
      if (name && !projects.some((p) => projectKey(p) === projectKey(name))) projects.push(name);
    }
    // The projects a new document can go in: only this computer's own.
    const mine = store.listProducts().filter((p) => !p.team?.direct).map((p) => p.name).sort((a, b) => a.localeCompare(b));
    return { files: rows, projects: projects.sort((a, b) => a.localeCompare(b)), folders: lib.folders, mine };
  }

  /** The project a new file goes in, which must be this computer's own, and the folder, which must be in it. */
  function whereNew(project: string, folder: string | null): { home: StoreProduct; into: FileFolder | null | undefined } {
    const home = store.listProducts().find((p) => !p.team?.direct && projectKey(p.name) === projectKey(project));
    if (!home) throw new Error('a new file goes in one of your own projects');
    const lib = shelf();
    const into = folder ? lib.folders.find((f) => f.id === lib.canon(folder)) : null;
    if (folder && !into) throw new Error('that folder is gone');
    if (into && projectKey(into.project) !== projectKey(home.name)) throw new Error('that folder is in another project');
    return { home, into };
  }

  /** `stem` + `ext`, or with -2, -3 when the project has a file of that name already. */
  function freeName(home: StoreProduct, stem: string, ext: string): string {
    const keys = new Set(allFiles().map((f) => f.key));
    const taken = (file: string): boolean => keys.has(fileKeyIn(home.name, file)) || fs.existsSync(path.join(home.dir, 'documents', file));
    let file = `${stem}${ext}`;
    for (let n = 2; taken(file); n += 1) file = `${stem}-${n}${ext}`;
    return file;
  }

  // Files lists only what a thread names, so new files get a thread of their
  // own, made closed by the person so no agent starts on it.
  function holdIn(home: StoreProduct, title: string, files: readonly string[]): void {
    const body = files.map((f) => `[${f}](documents/${f})`).join('\n');
    store.modules.workItemsDisk.createWorkItem(home.dir, { title, kind: 'directive', labels: ['founder', FILE_HOME], status: 'done', body }, { source: 'founder' });
  }

  function placeIn(home: StoreProduct, into: FileFolder | null | undefined, files: readonly string[], by: string | null): void {
    if (!into) return;
    const at = Date.now();
    for (const f of files) writeFolderLog(logDir(), { op: 'place', key: fileKeyIn(home.name, f), project: home.name, family: familyOfName(f), folder: into.id, by, at });
    void crossing();
  }

  return {
    list,

    crossing,

    async makeFolder({ project, name, parent = null, by = team?.state?.().me?.id ?? null }: { project: string; name: string; parent?: string | null; by?: string | null }) {
      const clean = cleanFolderName(name);
      if (!clean) throw new Error('a folder needs a name');
      if (!String(project ?? '').trim()) throw new Error('a folder sits in a project');
      const lib = shelf();
      const above = parent ? lib.folders.find((f) => f.id === lib.canon(parent)) : null;
      if (parent && !above) throw new Error('that folder is gone');
      if (above?.parent) throw new Error('folders go one level deep');
      const at = Date.now();
      const op = writeFolderLog(logDir(), { op: 'folder', id: newFolderId(), project: above?.project ?? project, name: clean, parent: above?.id ?? null, by, at });
      void crossing();
      return { id: op.id, project: op.project, name: op.name, parent: op.parent, at };
    },

    async renameFolder({ id, name, by = team?.state?.().me?.id ?? null }: { id: string; name: string; by?: string | null }) {
      const clean = cleanFolderName(name);
      if (!clean) throw new Error('a folder needs a name');
      const lib = shelf();
      const was = lib.folders.find((f) => f.id === lib.canon(id));
      if (!was) throw new Error('that folder is gone');
      writeFolderLog(logDir(), { op: 'folder', id: was.id, project: was.project, name: clean, parent: was.parent, by, at: Date.now() });
      void crossing();
      return { ok: true };
    },

    /** A file's place is by its identity, so this holds for every version, past and to come. */
    async moveFile({ key, folder = null, by = team?.state?.().me?.id ?? null }: { key: string; folder?: string | null; by?: string | null }) {
      const lib = shelf();
      const file = allFiles().find((f) => f.key === key);
      if (!file) throw new Error('that file is gone');
      const into = folder ? lib.folders.find((f) => f.id === lib.canon(folder)) : null;
      if (folder && !into) throw new Error('that folder is gone');
      if (into && projectKey(into.project) !== projectKey(file.project)) throw new Error('that folder is in another project');
      writeFolderLog(logDir(), { op: 'place', key, project: file.project, family: familyIn(key), folder: into?.id ?? null, by, at: Date.now() });
      void crossing();
      return { ok: true };
    },

    /**
     * An empty document, made by the person rather than an agent. Files lists
     * only what a thread names, so it gets a thread of its own, made closed so
     * no agent starts on it.
     */
    async newDocument({ project, name, kind = 'document', folder = null, by = team?.state?.().me?.id ?? null }: { project: string; name: string; kind?: string; folder?: string | null; by?: string | null }) {
      const title = cleanFolderName(name);
      if (!title) throw new Error(`a ${kind} needs a name`);
      const made = MADE[kind as MadeKind] as (typeof MADE)[MadeKind] | undefined;
      if (!made) throw new Error('New makes a document or a table');
      const { home, into } = whereNew(project, folder);
      const stem = title.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || kind;
      const file = freeName(home, stem, made.ext);
      fs.mkdirSync(path.join(home.dir, 'documents'), { recursive: true });
      fs.writeFileSync(path.join(home.dir, 'documents', file), made.seed, { flag: 'wx' });
      holdIn(home, title, [file]);
      placeIn(home, into, [file], by);
      return { key: fileKeyIn(home.name, file) };
    },

    /** Copies of files from this computer, into the project's documents. A kind Files cannot show is left out and named. */
    async addFiles({ project, paths = [], folder = null, by = team?.state?.().me?.id ?? null }: { project: string; paths?: readonly string[]; folder?: string | null; by?: string | null }) {
      const { home, into } = whereNew(project, folder);
      const refused: string[] = [];
      const added: string[] = [];
      for (const from of paths) {
        const base = path.basename(String(from));
        if (!viewKind(base)) { refused.push(base); continue; }
        const ext = path.extname(base);
        const stem = base.slice(0, base.length - ext.length).normalize('NFC').replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._-]+/gu, '').replace(/^[-_.]+/, '').slice(0, 80) || 'file';
        const file = freeName(home, stem, ext.toLowerCase());
        fs.mkdirSync(path.join(home.dir, 'documents'), { recursive: true });
        fs.copyFileSync(from, path.join(home.dir, 'documents', file), fs.constants.COPYFILE_EXCL | fs.constants.COPYFILE_FICLONE);
        added.push(file);
      }
      if (added.length) {
        holdIn(home, added.length === 1 ? added[0] : `${added.length} files`, added);
        placeIn(home, into, added, by);
      }
      return { added: added.length, refused, keys: added.map((f) => fileKeyIn(home.name, f)) };
    },

    /** Files named on a thread, into a project's folder by that name, made if it is not there. */
    async fileIn({ project, names, folder, by = team?.state?.().me?.id ?? null }: { project: string; names: readonly string[]; folder: string; by?: string | null }) {
      const lib = shelf();
      const at = Date.now();
      const made = folderNamed({ project, name: folder, known: lib.folders, dir: logDir(), by, now: at, anywhere: false });
      for (const name of names) {
        writeFolderLog(logDir(), { op: 'place', key: fileKeyIn(project, name), project, family: familyOfName(name), folder: made.id, by, at });
      }
      void crossing();
      return made;
    },

    /** Folders and their files for an agent's team_read. A chat's file is left out: its owner decides who reads those. */
    async forAgents() {
      const { files, folders } = await this.list();
      return folders.map((f) => {
        const inside = files.filter((x) => x.folder === f.id && x.sentIn.some((s) => s.kind !== 'chat'));
        return {
          id: f.id, project: f.project, folder: f.name,
          ...(f.parent ? { inside: folders.find((x) => x.id === f.parent)?.name ?? null } : {}),
          files: inside.slice(0, FILES_FOR_AGENTS).map((x) => ({
            file: x.name, path: x.opened, versions: x.versions, openComments: x.open, approved: x.approvedBy.length > 0,
          })),
          ...(inside.length > FILES_FOR_AGENTS ? { more: inside.length - FILES_FOR_AGENTS } : {}),
        };
      });
    },

    /** The next version of a file, from any place that names it. `goes: 'sent'` is one still on its way to its owner. */
    async edit(key: string, text: unknown): Promise<EditAnswer> {
      const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error: `${error} Nothing was saved. Your words are still here.` });
      const file = find(key);
      if (!file) return refuse('That file is gone.');
      if (file.kind !== 'markdown') return refuse('Only documents can be edited here.');
      if (typeof text !== 'string' || !text.trim()) return refuse('There are no words to save.');
      const thread = whereEditsGo(file.chain);
      const base = thread && threadFiles(filesInLines(thread.lines)).find((f) => f.key === familyIn(file.key))?.versions.at(-1);
      if (!base) return refuse('No thread holds that file now.');
      // `base` was found on `thread`, so below it is never null.
      try {
        const { chain } = await lineChain(file);
        if (thread!.ref.kind === 'thread' && chain.length === 1 && chain[0].blank) {
          await fs.promises.writeFile(chain[0].opened!, text);
          return { ok: true };
        }
        if (thread!.ref.kind === 'shared') {
          if (new TextEncoder().encode(text).length > MAX_EDIT_BYTES) return refuse('This document is too long to send from here. Whoever made it can edit it on their own thread.');
          await team!.markSharedFile(thread!.ref.ownerId, thread!.ref.threadId, { do: 'edit', file: base.id, text });
          return { ok: true, goes: 'sent', to: thread!.ref.ownerId };
        }
        if (thread!.ref.kind === 'room') {
          const stored = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.-]+/g, '-')}`;
          const put = await team!.rooms!.putFile(thread!.ref.roomId, { name: stored, dataBase64: Buffer.from(text).toString('base64') });
          // putFile answers with the stored name and throws when it fails, so this never refuses.
          if ((put as RoomPut)?.ok === false) return refuse((put as RoomPut).error ?? 'The group would not take it.');
          await team!.rooms!.send(thread!.ref.roomId, editedWords(file.name, `attachments/${stored}`), { inReplyTo: null, mentions: [] });
          return { ok: true };
        }
        const saved = this.editOnThread({ product: thread!.ref.product, id: thread!.ref.id, baseId: base.id, text, taken: file.chain.map((v) => v.name) });
        return saved.ok ? saved : refuse(saved.error);
      } catch (err) {
        return refuse(String((err as Error | null)?.message ?? err));
      }
    },

    /** A version written on one of this person's own threads. A chat carries it as a message, which is what reaches the other person. */
    editOnThread({ product, id, path: basePath, baseId, text, taken, since }: {
      product: string;
      id: string;
      path?: string | null;
      baseId?: string | null;
      text: unknown;
      taken?: string[] | null;
      since?: string | null;
    }): { ok: false; error: string } | { ok: true; path: string } {
      const here = store.listProducts().find((p) => p.slug === product);
      if (!here || !store.readItem(product, id)) return { ok: false, error: 'that thread is gone' };
      const lines = store.readHistory(product, id, { max: Number.MAX_SAFE_INTEGER });
      const clean = String(basePath ?? '').replace(/^\.\//, '');
      const names = taken ?? allFiles().find((f) => f.chain.some((v) => v.copies.some((c) => c.thread.ref.id === id && c.path === clean)))?.chain.map((v) => v.name) ?? [];
      const saved = saveNextVersion({ dir: here.dir, threadId: id, lines, basePath, baseId, text, since, taken: names });
      if (!saved.ok) return saved;
      if (saved.unchanged) return { ok: true, path: saved.path };
      if (here.team?.direct) store.answerItem(product, id, { answer: editedWords(saved.shown, saved.path) });
      else store.fileMark(product, id, { do: 'edit', file: saved.file, path: saved.path, ...(saved.over ? { over: saved.over } : {}) });
      return { ok: true, path: saved.path };
    },

    /**
     * A picture a document names that no path finds: the file in Files of that
     * family, at the version of that name, or else at the version its -vN says.
     */
    async pictureNamed(src: unknown): Promise<string | null> {
      const name = shownName(String(src ?? '').replace(/^\.\//, ''));
      if (reviewKind(name) !== 'image') return null;
      const family = familyOfName(name);
      const n = Number(/[-_ ]v(\d+)\.[^.]+$/i.exec(name)?.[1] ?? 0);
      for (const f of allFiles().filter((x) => familyIn(x.key) === family)) {
        const v = f.chain.find((x) => x.name === name) ?? (n ? f.chain[n - 1] : null);
        const found = v && await openedOf(f, v);
        if (found) return found;
      }
      return null;
    },

    async open(key: string) {
      const whole = find(key);
      if (!whole) return null;
      const { chain, same } = await lineChain(whole);
      if (!chain.length) return null;
      const file: LinedFile = { ...asOf(whole, chain), notes: whole.notes.map((n) => (same.has(n.file) ? { ...n, file: same.get(n.file)! } : n)) };
      const opened = new Map<string, string>();
      for (const v of file.chain) opened.set(v.id, v.opened ?? await openedOf(file, v, { fetch: true }) ?? v.copies[0]?.path ?? v.name);
      return viewOf(file, opened);
    },

    /**
     * Each file a thread names, as its line numbers it: every version, where it
     * opens on this computer (null when only a teammate has it), and `here`, the
     * paths this thread named it by.
     */
    async lineFor({ product, id }: { product: string; id: string }): Promise<FileLine[]> {
      const isHere = (t: PlaceThread): boolean => t.ref.kind === 'thread' && t.ref.product === product && t.ref.id === id;
      const out: FileLine[] = [];
      for (const whole of allFiles().filter((f) => f.chain.some((v) => v.copies.some((c) => isHere(c.thread))))) {
        const { chain } = await lineChain(whole);
        if (!chain.length) continue;
        out.push({
          key: whole.key,
          versions: chain.map((v) => ({
            n: v.n, name: v.name, path: v.opened, by: v.by ?? null, at: v.at || 0,
            ...(typeof v.agent === 'string' ? { agent: v.agent } : {}),
            here: v.copies.filter((c) => isHere(c.thread)).map((c) => c.path),
          })),
        });
      }
      return out;
    },

    /**
     * The comments and approvals on other copies of the file a thread names at
     * `path`: copies in the same project with the same bytes, under whatever
     * name. `file` is the version's name in this thread; theirs are given it.
     */
    async sameFile({ product, id, path: src, file: here }: { product: string; id: string; path: string; file: string }, files: PlacedFile[] = allFiles()): Promise<FileElsewhere> {
      const none: FileElsewhere = { key: null, notes: [], approvals: [] };
      const isHere = (t: PlaceThread): boolean => t.ref.kind !== 'shared' && t.ref.product === product && t.ref.id === id;
      const home = files.find((f) => f.chain.some((v) => v.copies.some((c) => isHere(c.thread) && c.path === src)));
      const mine = await onDisk(src, product, null, copiesNow(files).products!);
      const me = mine && await bytesOf(mine);
      if (!home || !me) return none;
      const notes: FileElsewhere['notes'] = [];
      const approvals: FileElsewhere['approvals'] = [];
      for (const { f, v, c, bytes: it } of await copiesIn(files, home.project)) {
        if (isHere(c.thread) || it.size !== me.size || it.hash !== me.hash) continue;
        for (const n of f.notes) {
          if (n.thread !== c.thread || n.file !== v.id || notes.some((x) => x.id === n.id)) continue;
          const { thread, ...rest } = n;
          notes.push({ ...rest, file: here, in: thread.title, key: f.key });
        }
        for (const a of f.approvals) {
          if (a.thread !== c.thread || a.file !== v.id) continue;
          const { thread: _t, ...rest } = a;
          approvals.push({ ...rest, file: here, key: f.key });
        }
      }
      return { key: home.key, notes, approvals };
    },

    /** sameFile for every file a thread names, from one reading of the threads. */
    async sameFiles({ product, id, copies }: { product: string; id: string; copies?: ReadonlyArray<{ path?: unknown; file?: unknown } | null> | null }): Promise<FileElsewhere[]> {
      const files = allFiles();
      return Promise.all((copies ?? []).map((c) => this.sameFile({ product, id, path: String(c?.path ?? ''), file: String(c?.file ?? '') }, files)));
    },

    /** A comment, approval or "seen" from the big view, written where it belongs. */
    async mark(key: string, mark: { do?: string; on?: string | readonly string[]; file?: string } | null | undefined): Promise<MarkAnswer> {
      const file = find(key);
      if (!file || !mark || typeof mark !== 'object') return { ok: false, error: 'that file is gone' };
      try {
        if (mark.do === 'resolve' || mark.do === 'reopen' || mark.do === 'reply') {
          const n = file.notes.find((x) => x.id === mark.on);
          if (!n) return { ok: false, error: 'that comment is gone' };
          await writeTo(n.thread, mark);
        } else if (mark.do === 'seen') {
          const by = new Map<PlaceThread, string[]>();
          for (const id of mark.on ?? []) {
            const hit = file.notes.find((x) => x.id === id)?.thread ?? file.approvals.find((a) => approvalId(a) === id)?.thread;
            if (hit) by.set(hit, [...(by.get(hit) ?? []), id]);
          }
          for (const [thread, on] of by) await writeTo(thread, { do: 'seen', on });
        } else if (mark.do === 'toagent') {
          // Send hands over every waiting comment at once, each on the thread it was written in.
          const by = new Map();
          for (const id of mark.on ?? []) {
            const thread = file.notes.find((x) => x.id === id)?.thread;
            if (thread) by.set(thread, [...(by.get(thread) ?? []), id]);
          }
          if (!by.size) return { ok: false, error: 'that comment is gone' };
          for (const [thread, on] of by) await writeTo(thread, { do: 'toagent', on });
          const own = [...by.keys()].find((t) => t.ref.kind !== 'shared' && t.ref.kind !== 'room');
          if (own) return { ok: true, wrote: { product: own.ref.product, id: own.ref.id } };
        } else if (mark.do === 'note' || mark.do === 'approve' || mark.do === 'unapprove') {
          const { chain } = await lineChain(file);
          const v = chain.find((x) => x.id === mark.file);
          if (!v) return { ok: false, error: 'that version is gone' };
          // Taking an approval back is done where it was given.
          const given = mark.do === 'unapprove' ? file.approvals.find((a) => a.file === v.id && a.by === (team?.state?.().me?.id ?? null)) : null;
          // A version only a teammate has is marked where the file's newest was said.
          const thread = given?.thread ?? v.copies[0]?.thread ?? file.chain.at(-1)!.copies[0].thread;
          await writeTo(thread, mark);
          if (mark.do !== 'unapprove' && thread.ref.kind !== 'shared' && thread.ref.kind !== 'room') return { ok: true, wrote: { product: thread.ref.product, id: thread.ref.id } };
        } else return { ok: false, error: 'that cannot be done here' };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String((err as Error | null)?.message ?? err) };
      }
    },
  };
}

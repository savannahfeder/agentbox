// WHAT A QUERY FINDS INSIDE THREADS: a line in a message, a file by its name,
// a markdown file by what it says, a comment on a file.
//
// The thread search only looked at a thread's title and its latest words, so a
// status post anywhere in a long thread could not be found. Each thread is read
// once into a folded copy of its messages, files and comments, rebuilt only
// when its version changes, so a keystroke is a scan of strings and no file is
// opened. The threads on offer are decided by the caller (`listThreads`): this
// never reaches past that list, and it reads a file only through `resolve`,
// which stays inside the thread's own project.
import fs from 'node:fs';
import path from 'node:path';
import { resolveArtifact } from './artifact-path.mts';
import { filesInLines, marksOf, reviewKind, threadFiles } from '../shared/artifact-marks.mts';
import { editOfLine, resolveEdits } from '../shared/message-edits.mts';
import { firstHit, fold, holds, queryOf, windowAround } from '../shared/word-match.mts';
import { withoutFileHomes } from '../shared/file-home.mts';
import { isCauseLedger, withoutBrief } from '../shared/causes.mts';
import type { ArtifactProduct } from './artifact-path.mts';
import type { FileFamily, FileVersion, LinePatch, NotePlace, ReviewKind, ThreadLine } from '../shared/artifact-marks.mts';
import type { Store } from './store.mts';
import type { EditLine } from '../shared/message-edits.mts';

export type FinderLine = Omit<ThreadLine, 'patch'> & {
  claim?: unknown;
  heartbeat?: unknown;
  release?: unknown;
  patch?: (LinePatch & { edit?: unknown; comment?: { text?: unknown } | null }) | null;
};

export interface FoundMessage { uid: string; by: string | null; at: number; source: 'founder' | 'system' | 'agent'; text: string; comment?: boolean }
export interface FoundFile { src: string; name: string; by: string | null; at: number; kind: ReviewKind | null }
export interface FoundNote { id: string; file: string; text: string; by: string | null; at: number; resolved: boolean; place: NotePlace; pin?: number; src: string; name: string }

export type FinderThread = { key: string; version: unknown; updatedAt?: number } & (
  | { kind: 'thread' | 'chat'; product: string; id: string; ownerId?: undefined; threadId?: undefined }
  | { kind: 'shared'; ownerId: string; threadId: string; product?: undefined; id?: undefined }
);

export interface LoadedThread { lines: readonly FinderLine[]; resolve: ((src: string) => Promise<string | null>) | null }

type Folded<T> = T & { f: string };
type FileRow = Folded<FoundFile> & { lines: Folded<{ text: string }>[] };

type Where = Pick<FinderThread, 'kind' | 'updatedAt'> & { product: string | null; id: string | null; ownerId: string | null; threadId: string | null };
type Ranked = { rank?: number; m?: { at: number }; n?: { at: number } };

interface FinderEntry {
  version: unknown;
  builtAt: number;
  hasText: boolean;
  messages: Folded<FoundMessage>[];
  files: FileRow[];
  notes: Folded<FoundNote>[];
}

export interface FinderTeam {
  sharedThreads?: () => ReadonlyArray<{ ownerId: string; threadId: string; version: unknown; updatedAt?: number }>;
  threadWork(owner: string, threadId: string): { shared: boolean; lines: readonly FinderLine[]; product?: string | null; dir?: string | null };
}

export const SNIPPET_CHARS = 180;
export const MARKDOWN_BYTES = 400_000;
const MESSAGE_CHARS = 4000;
// A thread that holds a markdown file is looked at again after this, because
// the file can change on disk with no new line.
const LOOK_AGAIN_MS = 60_000;
// Stale threads rebuilt before an answer; the rest are rebuilt behind it.
const REBUILT_BEFORE_ANSWER = 25;
const FIELDS = ['body', 'answer', 'result', 'note'];
const WITHDRAWN = '(withdrawn)';

const said = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
// Read as words: a link is its label, and no mark-up or address is matched or shown.
// A cloud run's asks are cards in the thread; elsewhere they are machine words.
const plain = (text: string): string => text
  .replace(/^\s*`?AGENTBOX-NEEDS:\s*(sign-in|key|file|code)\s.*$/gim, '')
  .replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1')
  .replace(/```[^\n]*\n?/g, '')
  .replace(/^\s{0,3}#{1,6}\s+/gm, '')
  .replace(/(\*\*|__|`)/g, '');
const clip = (text: string): string => plain(text.length > MESSAGE_CHARS ? text.slice(0, MESSAGE_CHARS) : text);
const tick = (): Promise<unknown> => new Promise((resolve) => setImmediate(resolve));

/** The messages in a thread's ledger lines: who wrote them, when, and the line they can be opened at. */
export function messagesOf(lines: readonly FinderLine[] | null | undefined): FoundMessage[] {
  const edits = resolveEdits(
    (lines ?? []).filter((l) => l?.patch && !l.patch.edit).map((l) => ({ uid: l.uid ?? null, by: l.by ?? null })),
    (lines ?? []).map(editOfLine).filter(Boolean) as EditLine[],
  );
  const out: FoundMessage[] = [];
  let firstBodyTaken = false;
  for (const l of lines ?? []) {
    const p = l?.patch;
    if (!p || l.claim || l.heartbeat || l.release || p.edit) continue;
    const edit = l.uid ? edits.get(l.uid) : undefined;
    if (edit?.gone) continue;
    const at = Number(l.ts) || 0;
    const base: Omit<FoundMessage, 'text'> = { uid: l.uid ?? `at-${at}`, by: l.by ?? null, at, source: l.source === 'founder' ? 'founder' : l.source === 'system' ? 'system' : 'agent' };
    for (const field of FIELDS) {
      let text = said(p[field]);
      if (!text || (field === 'answer' && text === WITHDRAWN)) continue;
      // A worker rewriting the row's description is not a message; the ask is.
      if (field === 'body') {
        if (l.source !== 'founder' && firstBodyTaken) continue;
        firstBodyTaken = true;
      }
      if (edit?.text && l.source === 'founder' && (field === 'answer' || field === 'body')) text = edit.text;
      out.push({ ...base, text: clip(text) });
    }
    const comment = said(p.comment?.text);
    if (comment) out.push({ ...base, comment: true, text: clip(comment) });
  }
  return out;
}

/** Files, and the comments on them, from a thread's ledger lines. */
export function filesAndNotesOf(lines: readonly FinderLine[] | null | undefined): { files: FoundFile[]; notes: FoundNote[] } {
  const families = threadFiles(filesInLines(lines));
  const versions = new Map(families.flatMap((f) => f.versions.map((v): [string, { v: FileVersion; family: FileFamily }] => [v.id, { v, family: f }])));
  const entries = (lines ?? []).filter((l) => l?.patch?.artifact).map((l) => ({ ...l.patch!.artifact, by: l.by ?? null, ts: l.ts, uid: l.uid ?? null }));
  const notes = marksOf(entries).notes.flatMap((n): FoundNote[] => {
    const hit = versions.get(n.file);
    return hit ? [{ id: n.id, file: n.file, text: n.text, by: n.by, at: n.ts, resolved: !!n.resolved, place: n.place, pin: n.pin, src: hit.v.path, name: hit.v.name }] : [];
  });
  const files = families.map((f): FoundFile => {
    const newest = f.versions[f.versions.length - 1];
    return { src: newest.path, name: newest.name, by: newest.by, at: newest.at, kind: reviewKind(newest.path) };
  });
  return { files, notes };
}

export function createFinder({ listThreads, loadThread, readText = async () => null, now = Date.now }: {
  listThreads: () => readonly FinderThread[];
  loadThread: (t: FinderThread) => Promise<LoadedThread>;
  readText?: (file: string, max: number) => Promise<string | null>;
  now?: () => number;
}) {
  // key -> { version, builtAt, hasText, messages, files, notes }
  const built = new Map<string, FinderEntry>();
  const building = new Map<string, Promise<FinderEntry | null>>();

  async function build(t: FinderThread): Promise<FinderEntry> {
    const loaded = await loadThread(t);
    const { files, notes } = filesAndNotesOf(loaded.lines);
    // A cause row's body is its lead's brief, which nobody said.
    const lines = isCauseLedger(loaded.lines) ? withoutBrief(loaded.lines) : loaded.lines;
    const messages = messagesOf(lines).map((m) => ({ ...m, f: fold(m.text) }));
    const fileRows: FileRow[] = [];
    for (const f of files) {
      const row: FileRow = { ...f, f: fold(f.name), lines: [] };
      if (f.kind === 'markdown' && loaded.resolve) {
        const file = await loaded.resolve(f.src).catch(() => null);
        const text = file ? await readText(file, MARKDOWN_BYTES).catch(() => null) : null;
        if (text) row.lines = text.split(/\r?\n/).map((s) => plain(s).trim()).filter(Boolean).map((s) => ({ text: s, f: fold(s) }));
      }
      fileRows.push(row);
    }
    const noteRows = notes.map((n) => ({ ...n, f: fold(n.text) }));
    const entry: FinderEntry = {
      version: t.version, builtAt: now(), hasText: fileRows.some((f) => f.lines.length > 0 || f.kind === 'markdown'),
      messages, files: fileRows, notes: noteRows,
    };
    built.set(t.key, entry);
    return entry;
  }

  function ensure(t: FinderThread): Promise<FinderEntry | null> {
    let run = building.get(t.key);
    if (!run) {
      run = build(t).catch(() => built.get(t.key) ?? null).finally(() => building.delete(t.key));
      building.set(t.key, run);
    }
    return run;
  }

  const staleOf = (t: FinderThread, entry: FinderEntry | undefined): boolean => !entry || entry.version !== t.version || (entry.hasText && now() - entry.builtAt > LOOK_AGAIN_MS);

  /** Reads every thread that has no copy yet, a few at a time, so a window is never held for long. */
  async function warm() {
    const threads = listThreads();
    let since = Date.now();
    for (const t of threads) {
      if (!staleOf(t, built.get(t.key))) continue;
      await ensure(t);
      if (Date.now() - since > 8) { await tick(); since = Date.now(); }
    }
    for (const key of built.keys()) if (!threads.some((t) => t.key === key)) built.delete(key);
  }

  async function search(query: string, { lines = 6, files = 5, comments = 5 }: { lines?: number; files?: number; comments?: number } = {}) {
    const q = queryOf(query);
    const empty = { lines: [], files: [], comments: [], total: { lines: 0, files: 0, comments: 0 } };
    if (!q.terms.length) return empty;
    const threads = listThreads();
    const behind = threads.filter((t) => staleOf(t, built.get(t.key)));
    const must = behind.filter((t) => !built.get(t.key));
    const should = behind.filter((t) => built.get(t.key));
    for (const t of must) await ensure(t);
    for (const t of should.slice(0, REBUILT_BEFORE_ANSWER)) await ensure(t);
    for (const t of should.slice(REBUILT_BEFORE_ANSWER)) void ensure(t);

    const foundLines: Array<{ where: Where; m: Folded<FoundMessage>; rank: number }> = [];
    const foundFiles: Array<{ where: Where; f: FileRow; name?: boolean; l?: Folded<{ text: string }> }> = [];
    const foundNotes: Array<{ where: Where; n: Folded<FoundNote>; rank: number }> = [];
    for (const t of threads) {
      const entry = built.get(t.key);
      if (!entry) continue;
      const where: Where = { kind: t.kind, product: t.product ?? null, id: t.id ?? null, ownerId: t.ownerId ?? null, threadId: t.threadId ?? null, updatedAt: t.updatedAt ?? 0 };
      // Only references are kept while scanning: a snippet is cut for the few
      // that are shown, not for every hit of a common word.
      for (const m of entry.messages) {
        if (holds(m.f, q)) foundLines.push({ where, m, rank: q.phrase && m.f.includes(q.phrase) ? 1 : 0 });
      }
      for (const f of entry.files) {
        if (holds(f.f, q)) { foundFiles.push({ where, f, name: true }); continue; }
        const l = f.lines.find((x) => holds(x.f, q));
        if (l) foundFiles.push({ where, f, l });
      }
      for (const n of entry.notes) {
        if (holds(n.f, q)) foundNotes.push({ where, n, rank: 0 });
      }
    }
    // Every hit carries one of `m` and `n`.
    const newest = (a: Ranked, b: Ranked): number => (b.rank ?? 0) - (a.rank ?? 0) || (b.m ?? b.n)!.at - (a.m ?? a.n)!.at;
    const byName = (a: (typeof foundFiles)[number], b: (typeof foundFiles)[number]): number => (!!a.name === !!b.name ? b.f.at - a.f.at : a.name ? -1 : 1);
    foundLines.sort(newest);
    foundFiles.sort(byName);
    foundNotes.sort(newest);
    return {
      lines: foundLines.slice(0, lines).map(({ where, m }) => ({
        ...where, uid: m.uid, by: m.by, source: m.source, at: m.at, comment: !!m.comment, text: windowAround(m.text, firstHit(m.f, q), SNIPPET_CHARS),
      })),
      files: foundFiles.slice(0, files).map(({ where, f, l }) => ({
        ...where, how: l ? 'contents' : 'name', src: f.src, name: f.name, by: f.by, at: f.at, text: l ? windowAround(l.text, firstHit(l.f, q), SNIPPET_CHARS) : '',
      })),
      comments: foundNotes.slice(0, comments).map(({ where, n }) => ({
        ...where, src: n.src, name: n.name, by: n.by, at: n.at, resolved: n.resolved, noteId: n.id, fileId: n.file, text: windowAround(n.text, firstHit(n.f, q), SNIPPET_CHARS),
      })),
      total: { lines: foundLines.length, files: foundFiles.length, comments: foundNotes.length },
    };
  }

  return { search, warm };
}

/**
 * The teammates' threads this person may search: the ones the cloud still
 * shows them a card for, that are not their own and that are not hidden. A
 * folder on disk with no such card (a thread its owner took private, not yet
 * cleared here) is never searched.
 */
export function readableSharedThreads<F extends { ownerId: string; threadId: string }>({ cards, me, folders }: {
  cards?: ReadonlyArray<{ personId?: string | null; threadId?: string | null; visible?: boolean } | null> | null;
  me: string | null;
  folders?: readonly F[] | null;
}): F[] {
  const open = new Set((cards ?? []).filter((c) => c && c.personId && c.personId !== me && c.visible !== false).map((c) => `${c!.personId}/${c!.threadId}`));
  return (folders ?? []).filter((f) => open.has(`${f.ownerId}/${f.threadId}`));
}

/** The whole store and the shared threads, as the finder reads them. */
export function appFinder({ store, team, readableProducts, accountRoot, storeRoot, now = Date.now }: {
  store: Pick<Store, 'listProducts' | 'listAllWorkItems' | 'readHistory'>;
  team?: FinderTeam | null;
  readableProducts: () => ArtifactProduct[];
  accountRoot?: string | null;
  storeRoot?: string | null;
  now?: () => number;
}) {
  const texts = new Map<string, { mtimeMs: number; size: number; text: string }>();
  const readText = async (file: string, max: number): Promise<string | null> => {
    const st = await fs.promises.stat(file);
    if (!st.isFile() || st.size > max) return null;
    const was = texts.get(file);
    if (was && was.mtimeMs === st.mtimeMs && was.size === st.size) return was.text;
    const text = await fs.promises.readFile(file, 'utf8');
    texts.set(file, { mtimeMs: st.mtimeMs, size: st.size, text });
    if (texts.size > 400) texts.delete(texts.keys().next().value!);
    return text;
  };
  // `inside` keeps a teammate's message from pointing the finder at a path of
  // its own choosing on this computer: only the copies in their thread's folder.
  const resolveIn = (product: string, inside: string | null = null) => async (src: string): Promise<string | null> => {
    const found = await resolveArtifact({ src, product, products: readableProducts(), accountRoot, storeRoot });
    if (!found.ok) return null;
    if (!inside) return found.path;
    try {
      const real = fs.realpathSync(found.path);
      return real.startsWith(fs.realpathSync(inside) + path.sep) ? real : null;
    } catch { return null; }
  };
  // Listing folds every project, so a burst of keystrokes shares one listing.
  let listed: { at: number; threads: FinderThread[] } = { at: -Infinity, threads: [] };
  const listThreads = (): FinderThread[] => {
    if (now() - listed.at < 2000) return listed.threads;
    const direct = new Set(store.listProducts().filter((p) => p.team?.direct).map((p) => p.slug));
    const mine = withoutFileHomes(store.listAllWorkItems()).map((i): FinderThread => ({
      key: `${i.product}/${i.id}`, kind: direct.has(i.product) ? 'chat' : 'thread', product: i.product, id: i.id, version: i.updatedAt, updatedAt: i.updatedAt,
    }));
    const theirs = (team?.sharedThreads?.() ?? []).map((s): FinderThread => ({
      key: `shared/${s.ownerId}/${s.threadId}`, kind: 'shared', ownerId: s.ownerId, threadId: s.threadId, version: s.version, updatedAt: s.updatedAt ?? 0,
    }));
    listed = { at: now(), threads: [...mine, ...theirs] };
    return listed.threads;
  };
  const loadThread = async (t: FinderThread): Promise<LoadedThread> => {
    if (t.kind === 'shared') {
      // Only the team lists shared threads.
      const w = team!.threadWork(t.ownerId, t.threadId);
      return { lines: w.shared ? w.lines : [], resolve: w.product && w.dir ? resolveIn(w.product, w.dir) : null };
    }
    return { lines: store.readHistory(t.product, t.id, { max: Number.MAX_SAFE_INTEGER }), resolve: resolveIn(t.product) };
  };
  return createFinder({ listThreads, loadThread, readText, now });
}

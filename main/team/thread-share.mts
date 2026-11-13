// THE WORK OF A SHARED THREAD: its messages, the files they link to, comments.
//
// A card says what a thread is; this is what is in it. On each sync pass one
// copy of the app does three things, all of them for threads that have a card
// and none for any that do not:
//
//   publish  your threads: newest messages, with links rewritten to the copies
//            of the files they name. The cloud's heads are compared every pass,
//            so nothing depends on a new line being written or on what this
//            copy remembers: a thread nobody has touched goes up on the first
//            pass after a start, and again if the cloud ever loses it.
//   take     everyone else's: what changed comes down to a folder per thread,
//            and a thread whose card you can no longer read is deleted here.
//   comments what people said on your threads goes on the thread's own ledger;
//            everyone else's are kept to be drawn.
//
// Tool lines and agents' working notes stay on the owner's computer.
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Stats } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { artifactRoots, resolveArtifact } from '../artifact-path.mts';
import { bytesOf, hideSecrets } from '../../shared/phone-snapshot.mts';
import { isShared, runnerOf } from '../../shared/team-rules.mts';
import { cleanMark, editedWords, familyName, fileNewsFor, filesInLines, isBookkeepingMark, marksOf, threadFiles } from '../../shared/artifact-marks.mts';
import { saveNextVersion } from '../file-version.mts';
import { MAX_MESSAGE_FILE_BYTES } from './sync.mts';
import { MAX_SHARED_SENT_BYTES as MAX_SENT_BYTES, PART_BYTES } from '../../shared/carried-files.mts';
import { findFileToSend, looksSecret, pieceSizes } from './carry-files.mts';
import type { SyncCard, SyncDisk } from './sync.mts';
import type { PhoneItem } from '../phone-inbox.mts';
import type { TeamHistoryLine, TeamProduct } from './index.mts';
import type { Mark } from '../../shared/artifact-marks.mts';

// Types, not interfaces, so a line goes to appendForeignLines as a LedgerLine.
export type SharedPatch = {
  body?: string;
  answer?: string;
  result?: string;
  note?: string;
  // Passed on as the owner's line had it, and cleaned on the reader's side.
  from?: unknown;
  comment?: { text: string; name?: string };
  artifact?: Mark;
};

export type SharedLine = {
  id: string;
  ts: number;
  source: 'founder' | 'agent' | 'system';
  by?: string;
  uid?: string;
  patch: SharedPatch;
};

interface OutLine { id?: string; ts: number; source?: string; by?: string; uid?: string; patch: SharedPatch }

export interface BigFile { name: string; size: number; parts: string[] }

interface OutMark { id?: string; ts: number; source: string; by?: string; uid?: string; patch: { artifact: Mark } }

interface PublishedWork { lines: OutLine[]; earlier: number; files: string[]; big?: BigFile[]; marks?: OutMark[] }

// A teammate's copy sent it, so nothing in it is believed until cleaned.
interface RawWork { lines?: unknown; files?: unknown; marks?: unknown; big?: unknown; earlier?: unknown }
interface RawLine {
  id?: unknown;
  ts?: unknown;
  source?: unknown;
  by?: unknown;
  uid?: unknown;
  patch?: { [key: string]: unknown; from?: { teammate?: unknown; name?: unknown } | null; comment?: { text?: unknown } | null; artifact?: unknown } | null;
}

interface LocalThread { hash: string; lines: SharedLine[]; earlier: number; files: string[]; big?: BigFile[]; marks: SharedLine[] }

interface FileCopy { name: string; file: string; size: number; tooBig?: undefined }
type FoundCopy = FileCopy | { tooBig: true; name?: undefined };

interface Built { at: number; updatedAt: number | undefined; work: PublishedWork; hash: string; files: Map<string, string>; big: BigFile[] }

export interface ThreadHead { personId: string; threadId: string; hash: string; updatedAt: number }

export interface ThreadComment { id: string; owner: string; threadId: string; by: string; text: string; at: number }

export interface ThreadFileMark { id: string; owner: string; threadId: string; by: string; mark: unknown; at: number }

export interface ThreadFileNews { owner: string; threadId: string; id: string; file: string; text: string | undefined; by: string | null; ts: number }

/** Words left on a thread or on one of its files, for the person's page in the window. */
export interface ThreadTalk { id: string; kind: 'comment' | 'note'; owner: string; threadId: string; by: string; text: string; at: number; file?: string; note?: string; to?: string[] }

export interface SharedThreadView { shared: boolean; lines: SharedLine[]; earlier: number; product: string | null; dir: string | null }

export interface ThreadShareBackend {
  threadWorkHeads?(): Promise<ThreadHead[]>;
  getThreadWork(owner: string, threadId: string): Promise<{ work: unknown; hash: string } | null>;
  putThreadWork(teamId: string, work: { threadId: string; hash: string; work: unknown }): Promise<void>;
  threadFileNames(threadId: string): Promise<string[]>;
  putThreadFile(threadId: string, name: string, data: string): Promise<void>;
  pruneThreadFiles(threadId: string, keep: string[]): Promise<void>;
  getThreadFile(owner: string, threadId: string, name: string): Promise<unknown>;
  threadComments(): Promise<ThreadComment[]>;
  addFileMark(owner: string, threadId: string, mark: { id: string; mark: unknown }): Promise<void>;
  fileMarks?(): Promise<ThreadFileMark[]>;
}

export interface ThreadShareOptions {
  backend: ThreadShareBackend;
  me: string;
  root: string;
  listCards: () => SyncCard[] | null | undefined;
  listThreads: () => Map<string, { item: PhoneItem; product: TeamProduct }>;
  historyOf: (slug: string, id: string) => TeamHistoryLine[];
  disk: SyncDisk;
  accountRoot: string;
  storeRoot?: string;
  listProducts?: () => TeamProduct[];
  onChange?: () => void;
  log?: (line: string) => void;
  now?: () => number;
  home?: string;
  myName?: () => string | null;
  /** A teammate's name by their id, carried on their comment for the owner's agent. */
  nameOf?: (personId: string) => string | null | undefined;
}

export interface ThreadShare {
  pass(teamId: string | null | undefined): Promise<void>;
  read(owner: string, threadId: string): SharedThreadView;
  folders(): { ownerId: string; threadId: string; version: string }[];
  products(): { slug: string; name: string; dir: string }[];
  fileByHash(hash: string, o?: { fetch?: boolean }): Promise<string | null>;
  addMark(owner: string, threadId: string, mark: unknown): Promise<boolean>;
  fileNews(): ThreadFileNews[];
  talk(): ThreadTalk[];
  refreshComments(): Promise<void>;
}

// What one file call takes. A file over it goes in parts, up to MAX_SENT_BYTES.
export const MAX_THREAD_FILE_BYTES = MAX_MESSAGE_FILE_BYTES;
const PIECES_PER_PASS = 4;
export const NEWEST_MESSAGES = 40;
const TEXT_CHARS = 12_000;
const WORK_BYTES = 900_000;
// So one pass cannot hold the sync for a whole store; the rest go next pass.
const THREADS_PER_PASS = 8;
// A file can change on disk with no new line, so a thread is looked at again.
const LOOK_AGAIN_MS = 60_000;
const TOO_BIG = "(over 200 MB, so it stays on the owner's computer)";
const NEWEST_MARKS = 400;

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
const THREAD_ID = /^[\w-]{1,80}$/;
const SHARED_PREFIX = 'shared-thread';

// `.key` is left out on purpose: it is also what a private key is called.
const KINDS = 'png|jpe?g|gif|webp|svg|md|markdown|html?|csv|tsv|mp4|mov|m4v|webm|mp3|wav|m4a|aac|ogg|pdf|pptx?';
const PICTURE = /\.(?:png|jpe?g|gif|webp|svg)$/i;
const PATHISH = String.raw`(?:~\/|\.?\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:${KINDS})`;
const A_PATH = new RegExp(`^${PATHISH}$`, 'i');
const MENTION = new RegExp(
  String.raw`(!?)\[([^\]\n]*)\]\(<?([^()\s>]+)>?\)`
  + '|`(' + PATHISH + ')`'
  + String.raw`|(?<![\w./:@~(\[-])(${PATHISH})(?![\w/-])`,
  'gi',
);
const FENCE = /(```[\s\S]*?(?:```|$))/;

/** Every file a message names, outside code blocks, with whether the writer pointed at it (a link, a code span, a path) or only used a word. */
function mentionsIn(text: string): { src: string; meant: boolean }[] {
  const out: { src: string; meant: boolean }[] = [];
  for (const [i, part] of text.split(FENCE).entries()) {
    if (i % 2) continue;
    for (const m of part.matchAll(MENTION)) {
      const src = m[3] ?? m[4] ?? m[5];
      if (A_PATH.test(src)) out.push({ src, meant: m[5] === undefined || src.includes('/') });
    }
  }
  return out;
}

/**
 * `found` maps a path as written to { name } (a copy), { tooBig } or nothing.
 * `typed`: a person's own words, which a thread draws as typed. A file they
 * only named stays as they wrote it and goes on a line of its own under them.
 */
function withLinks(text: string, found: Map<string, FoundCopy>, { typed = false }: { typed?: boolean } = {}): string {
  const under: string[] = [];
  const swap = (whole: string, bang: string | undefined, label: string | undefined, url: string | undefined, code: string | undefined, bare: string | undefined) => {
    // Each of MENTION's three alternatives captures one of these.
    const src = (url ?? code ?? bare) as string;
    const hit = A_PATH.test(src) ? found.get(src) : null;
    if (!hit) return whole;
    const base = path.basename(src);
    const named = typed && url === undefined;
    const shows = bang || (!url && PICTURE.test(src)) ? '!' : '';
    const link = hit.tooBig ? `${label || base} ${TOO_BIG}` : `${shows}[${label || base}](attachments/${hit.name})`;
    if (!named) return link;
    if (!under.includes(link)) under.push(link);
    return whole;
  };
  const out = text.split(FENCE).map((part, i) => (i % 2 ? part : part.replace(MENTION, swap))).join('');
  return under.length ? `${out.replace(/\s+$/, '')}\n\n${under.join('\n')}` : out;
}

const clip = (text: string, home: string) => {
  const clean = hideSecrets(text, { home });
  return clean.length > TEXT_CHARS ? `${clean.slice(0, TEXT_CHARS)}…` : clean;
};
const said = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const WITHDRAWN = '(withdrawn)';

/** The ledger lines that are messages, as the thread view reads them, oldest first. */
function messageLines(lines: TeamHistoryLine[], me: string): OutLine[] {
  const out: OutLine[] = [];
  let opening: OutLine | null = null;
  // A task typed as one line has a title and no body: the title is what was asked.
  const all = Array.isArray(lines) ? lines : [];
  const noBody = !all.some((l) => said(l?.patch?.body));
  let titleIsTheAsk = noBody;
  const families = threadFiles(filesInLines(all));
  const callEdit = (at: string) => {
    const family = families.find((f) => f.versions.some((v) => v.path === at));
    return familyName(family, family?.versions.find((v) => v.path === at)) || path.basename(at);
  };
  for (const l of all) {
    const p = l?.patch;
    if (!p || l.claim || l.heartbeat || l.release) continue;
    // Taking a card down deletes its comments from the cloud, so the owner's
    // copy is what brings them back when the thread is shared again.
    if (p.comment) {
      const text = said(p.comment.text);
      if (l.by && String(l.uid ?? '').startsWith('comment-') && text) out.push({ id: l.id, ts: l.ts, source: 'system', by: l.by, uid: l.uid, patch: { comment: { text } } });
      continue;
    }
    // Readers only get files that a message links, so an edit goes out as one.
    if (p.artifact?.do === 'edit' && p.artifact.path) {
      out.push({ id: l.id, ts: l.ts, source: 'founder', by: l.by || me, ...(l.uid ? { uid: l.uid } : {}), patch: { answer: editedWords(callEdit(p.artifact.path), p.artifact.path) } });
      continue;
    }
    if (titleIsTheAsk && l.source === 'founder' && said(p.title)) {
      titleIsTheAsk = false;
      out.push({ id: l.id, ts: l.ts, source: l.source, by: l.by || me, ...(l.uid ? { uid: l.uid } : {}), patch: { body: p.title as string } });
      continue;
    }
    // A reply taken back is taken back from them too.
    if (p.answer === WITHDRAWN || p.answer === '') {
      for (let k = out.length - 1; k >= 0; k -= 1) if (out[k].patch.answer) { out.splice(k, 1); break; }
      continue;
    }
    const patch: SharedPatch = {};
    const body = said(p.body);
    if (body && opening) {
      // A rewritten ask replaces the ask, when the side that wrote it wrote this.
      if (opening.source === l.source) opening.patch.body = body;
    } else if (body && !said(p.answer) && !said(p.result) && !said(p.note)) patch.body = body;
    // A reply the app wrote from notes is for the agent; readers get the notes as notes, and what was typed with them.
    const answer = Array.isArray(p.fromNotes) ? said(p.typed) : said(p.answer);
    if (answer) patch.answer = answer;
    if (said(p.result)) patch.result = p.result as string;
    if (said(p.note)) patch.note = p.note as string;
    if (!Object.keys(patch).length) continue;
    if (p.from && patch.answer) patch.from = p.from;
    const line: OutLine = {
      id: l.id, ts: l.ts, source: l.source,
      // The agent's words are the agent's: a line it wrote is stamped with the
      // person whose Mac it ran on, which would draw it as theirs.
      ...(l.source === 'founder' ? { by: l.by || me } : {}),
      ...(l.uid ? { uid: l.uid } : {}),
      patch,
    };
    if (patch.body) opening = line;
    out.push(line);
  }
  return out;
}

export function createThreadShare({
  backend, me, root, listCards, listThreads, historyOf, disk, accountRoot, storeRoot, listProducts = () => [],
  onChange = () => {}, log = () => {}, now = Date.now, home = os.homedir(), myName = () => null, nameOf = () => null,
}: ThreadShareOptions): ThreadShare {
  const built = new Map<string, Built>();
  // Your threads with a card, and who may read each: null is the whole team.
  let readers = new Map<string, readonly string[] | null>();
  const named = new Map<string, { mtimeMs: number; size: number; name: string }>();
  const delivered = new Set<string>();
  let comments: ThreadComment[] = [];
  let fileMarks: ThreadFileMark[] = [];
  const deliveredMarks = new Set<string>();
  const missed = new Map<string, number>();
  const waitingFile = `${root}.marks-waiting.json`;
  let waiting: ThreadFileMark[] | null = null;
  let logged = '';
  const quietly = async <T, F = null>(what: string, fn: () => Promise<T>, fallback: F = null as F): Promise<T | F> => {
    try { return await fn(); } catch (err) {
      const line = `team threads: ${what}: ${(err as Error | null)?.message ?? err}`;
      if (line !== logged) { logged = line; log(line); }
      return fallback;
    }
  };

  const sumOfFile = (file: string) => {
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(PART_BYTES);
      for (let got = fs.readSync(fd, buf, 0, buf.length, null); got > 0; got = fs.readSync(fd, buf, 0, buf.length, null)) hash.update(buf.subarray(0, got));
    } finally { fs.closeSync(fd); }
    return hash.digest('hex').slice(0, 12);
  };

  // A file the writer pointed at may be in any project of theirs, not only this
  // thread's: they named it on purpose. A bare word looks in this thread's own,
  // its task folder first, as the owner's own view of the thread does.
  async function copyOf(product: TeamProduct, thread: string, src: string, meant: boolean): Promise<FoundCopy | null> {
    let real: string | null = null;
    const found = await resolveArtifact({ src, product: product.slug, products: [product], accountRoot, storeRoot, thread });
    if (found.ok) {
      try { real = fs.realpathSync(found.path); } catch { real = null; }
      const inside = real && artifactRoots(product).some((r) => {
        try { return real!.startsWith(fs.realpathSync(r) + path.sep); } catch { return false; }
      });
      if (!inside) real = null;
    }
    if (!real && meant) {
      const hit = await findFileToSend({ ref: src, meant: true, products: listProducts() });
      real = hit?.file ?? null;
    }
    if (!real || looksSecret(src) || looksSecret(path.basename(real))) return null;
    let st: Stats;
    try { st = fs.statSync(real); } catch { return null; }
    if (!st.isFile() || !A_PATH.test(path.basename(real))) return null;
    if (st.size > MAX_SENT_BYTES) return { tooBig: true };
    const was = named.get(real);
    if (was && was.mtimeMs === st.mtimeMs && was.size === st.size) return { name: was.name, file: real, size: st.size };
    const big = st.size > MAX_THREAD_FILE_BYTES;
    const sum = big ? sumOfFile(real) : crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex').slice(0, 12);
    // Room for ".p25of25" on the end of a part's name.
    const name = `${sum}-${path.basename(real).replace(/[^A-Za-z0-9_.-]/g, '-').slice(big ? -120 : -140)}`;
    named.set(real, { mtimeMs: st.mtimeMs, size: st.size, name });
    return { name, file: real, size: st.size };
  }

  const partsOf = (name: string, size: number) => pieceSizes(size).map((_, i, all) => `${name}.p${i + 1}of${all.length}`);

  async function build(item: PhoneItem, product: TeamProduct): Promise<Built> {
    const all = messageLines(historyOf(product.slug, item.id), me);
    let kept = all.slice(-NEWEST_MESSAGES);
    const texts = kept.flatMap((l) => (['body', 'answer', 'result', 'note'] as const).map((f) => l.patch[f]).filter(Boolean)) as string[];
    const found = new Map<string, FoundCopy>();
    const wanted = new Map<string, boolean>();
    for (const { src, meant } of texts.flatMap(mentionsIn)) wanted.set(src, !!(meant || wanted.get(src)));
    for (const [src, meant] of wanted) {
      const hit = await copyOf(product, item.id, src, meant);
      if (hit) found.set(src, hit);
    }
    kept = kept.map((l) => {
      const patch = { ...l.patch };
      for (const f of ['body', 'answer', 'result', 'note'] as const) if (patch[f]) patch[f] = clip(withLinks(patch[f], found, { typed: f === 'body' || f === 'answer' }), home);
      return { ...l, patch };
    });
    while (kept.length > 1 && bytesOf(kept) > WORK_BYTES) kept = kept.slice(1);
    const carried = new Set(kept.flatMap((l) => [...JSON.stringify(l.patch).matchAll(/\]\(attachments\/([\w.-]+)\)/g)].map((m) => m[1])));
    const kept2 = [...found.values()].filter((f) => f.name && carried.has(f.name)) as FileCopy[];
    const files = new Map(kept2.map((f) => [f.name, f.file]));
    // A file over one call's limit goes up in parts, listed here so a reader knows what to put back together.
    const big = [...new Map(kept2.filter((f) => f.size > MAX_THREAD_FILE_BYTES).map((f) => [f.name, { name: f.name, size: f.size, parts: partsOf(f.name, f.size) }])).values()];
    const marks = historyOf(product.slug, item.id)
      .filter((l) => l?.patch?.artifact && !isBookkeepingMark(l.patch.artifact) && l.patch.artifact.do !== 'edit')
      .slice(-NEWEST_MARKS)
      .map((l): OutMark => ({ id: l.id, ts: l.ts, source: 'system', ...(l.by ? { by: l.by } : {}), ...(l.uid ? { uid: l.uid } : {}), patch: { artifact: l.patch!.artifact! } }));
    const work: PublishedWork = { lines: kept, earlier: all.length - kept.length, files: [...files.keys()].sort(), ...(big.length ? { big } : {}), ...(marks.length ? { marks } : {}) };
    const hash = crypto.createHash('sha256').update(JSON.stringify(work)).digest('hex');
    return { at: now(), updatedAt: item.updatedAt, work, hash, files, big };
  }

  // A big file goes up in the background, a part at a time, so a long upload
  // never holds the sync. What is already up is not sent again; a part that
  // fails is left for the next pass to find missing.
  const goingUp = new Map<string, Promise<void>>();
  function goUp(threadId: string, f: BigFile, file: string, there: Set<string>) {
    const key = `${threadId}/${f.name}`;
    if (goingUp.has(key) || f.parts.every((n) => there.has(n))) return;
    const run = (async () => {
      const fd = fs.openSync(file, 'r');
      try {
        for (const [i, length] of pieceSizes(f.size).entries()) {
          if (there.has(f.parts[i])) continue;
          const buf = Buffer.alloc(length);
          fs.readSync(fd, buf, 0, length, i * PART_BYTES);
          await backend.putThreadFile(threadId, f.parts[i], buf.toString('base64'));
        }
      } finally { fs.closeSync(fd); }
    })().catch((err: Error | null) => log(`team threads: sending ${f.name} in parts: ${err?.message ?? err}`)).finally(() => goingUp.delete(key));
    goingUp.set(key, run);
  }

  async function publish(teamId: string, heads: ThreadHead[]) {
    const mine = new Map(heads.filter((h) => h.personId === me).map((h) => [h.threadId, h.hash]));
    const cards = listCards() ?? [];
    readers = new Map(cards.map((c) => [c.threadId, Array.isArray(c.people) ? c.people.filter((p): p is string => typeof p === 'string') : null]));
    if (!cards.length) { built.clear(); return; }
    const threads = listThreads();
    let done = 0;
    for (const card of cards) {
      if (done >= THREADS_PER_PASS) break;
      const thread = threads.get(card.threadId);
      if (!thread) continue;
      const { item, product } = thread;
      // A teammate's row in a project you share is theirs to publish.
      if (isShared(product) && runnerOf(item, product) !== me) continue;
      let b: Built | null | undefined = built.get(item.id);
      const current = b && b.updatedAt === item.updatedAt && now() - b.at < LOOK_AGAIN_MS;
      if (!current) {
        b = await quietly(`reading ${item.id}`, () => build(item, product));
        if (!b) continue;
        built.set(item.id, b);
      }
      // Here b is the current build, or the one just made: `current` was only true with one.
      if (mine.get(item.id) === b!.hash) continue;
      done += 1;
      await quietly(`publishing ${item.id}`, async () => {
        const there = new Set(await backend.threadFileNames(item.id));
        const bigNames = new Set(b!.big.map((f) => f.name));
        for (const [name, file] of b!.files) {
          if (!bigNames.has(name) && !there.has(name)) await backend.putThreadFile(item.id, name, fs.readFileSync(file).toString('base64'));
        }
        // Every big file is one of the files the build kept.
        for (const f of b!.big) goUp(item.id, f, b!.files.get(f.name)!, there);
        await backend.putThreadWork(teamId, { threadId: item.id, hash: b!.hash, work: b!.work });
        const keep = [...b!.files.keys(), ...b!.big.flatMap((f) => f.parts)];
        if ([...there].some((n) => !keep.includes(n))) await backend.pruneThreadFiles(item.id, keep);
      });
    }
  }

  const folderOf = (owner: string, threadId: string) => path.join(root, owner, threadId);
  const fileOf = (owner: string, threadId: string) => path.join(folderOf(owner, threadId), 'thread.json');
  const readLocal = (owner: string, threadId: string): LocalThread | null => {
    try { return JSON.parse(fs.readFileSync(fileOf(owner, threadId), 'utf8')); } catch { return null; }
  };

  /** Only what the thread view draws, whatever a teammate's copy sent. */
  function cleaned(work: RawWork | null | undefined): Omit<LocalThread, 'hash'> {
    const text = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const lines = (Array.isArray(work?.lines) ? work.lines as RawLine[] : []).filter((l) => l && typeof l === 'object' && l.patch).map((l): SharedLine => {
      const patch: SharedPatch = {};
      for (const f of ['body', 'answer', 'result', 'note'] as const) if (text(l.patch![f])) patch[f] = l.patch![f] as string;
      if (l.patch!.from?.name) patch.from = { teammate: String(l.patch!.from.teammate ?? ''), name: String(l.patch!.from.name) };
      const comment = text(l.patch!.comment?.text);
      if (comment && text(l.by) && String(l.uid ?? '').startsWith('comment-')) patch.comment = { text: comment };
      return {
        id: String(l.id ?? ''), ts: Number(l.ts) || 0, source: l.source === 'founder' ? 'founder' : l.source === 'system' ? 'system' : 'agent',
        ...(text(l.by) ? { by: l.by as string } : {}), ...(text(l.uid) ? { uid: l.uid as string } : {}), patch,
      };
    });
    const files = (Array.isArray(work?.files) ? work.files as unknown[] : []).filter((n): n is string => typeof n === 'string' && FILE_NAME.test(n));
    const marks = (Array.isArray(work?.marks) ? work.marks as (RawLine | null)[] : []).flatMap((l): SharedLine[] => {
      const artifact = cleanMark(l?.patch?.artifact);
      return artifact ? [{ id: String(l!.id ?? ''), ts: Number(l!.ts) || 0, source: 'system', ...(text(l!.by) ? { by: l!.by as string } : {}), ...(text(l!.uid) ? { uid: l!.uid as string } : {}), patch: { artifact } }] : [];
    });
    const big = (Array.isArray(work?.big) ? work.big as ({ name?: unknown; size?: unknown; parts?: unknown } | null)[] : []).flatMap((f): BigFile[] => {
      const size = Number(f?.size);
      const parts: unknown[] = Array.isArray(f?.parts) ? f.parts : [];
      const fine = typeof f?.name === 'string' && FILE_NAME.test(f.name) && files.includes(f.name) && size > MAX_THREAD_FILE_BYTES && size <= MAX_SENT_BYTES
        && parts.length === pieceSizes(size).length && parts.every((n) => typeof n === 'string' && FILE_NAME.test(n));
      return fine ? [{ name: f!.name as string, size, parts: parts as string[] }] : [];
    });
    return { lines, earlier: Math.max(0, Math.trunc(Number(work?.earlier) || 0)), files, ...(big.length ? { big } : {}), marks };
  }

  /* ---- marks on a shared thread's files ---- */

  function waitingMarks(): ThreadFileMark[] {
    if (waiting) return waiting;
    try { waiting = JSON.parse(fs.readFileSync(waitingFile, 'utf8')); } catch { waiting = []; }
    if (!Array.isArray(waiting)) waiting = [];
    return waiting;
  }
  function saveWaiting() {
    fs.mkdirSync(path.dirname(waitingFile), { recursive: true });
    const tmp = `${waitingFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(waiting ?? []));
    fs.renameSync(tmp, waitingFile);
  }

  /** Sends what is waiting. One that fails stays for the next pass; one for a thread gone from view is dropped. */
  async function sendWaiting(heads: ThreadHead[] | null) {
    const still: ThreadFileMark[] = [];
    const open = heads ? new Set(heads.map((h) => `${h.personId}/${h.threadId}`)) : null;
    const was = waitingMarks();
    for (const row of was) {
      if (open && !open.has(`${row.owner}/${row.threadId}`) && !fileMarks.some((m) => m.owner === row.owner && m.threadId === row.threadId)) {
        log(`team threads: dropped a note on ${row.threadId}, which is no longer shared with you`);
        continue;
      }
      try { await backend.addFileMark(row.owner, row.threadId, { id: row.id, mark: row.mark }); }
      catch (err) {
        const line = `team threads: sending a note: ${(err as Error | null)?.message ?? err}`;
        if (line !== logged) { logged = line; log(line); }
        still.push(row);
      }
    }
    if (still.length !== was.length) { waiting = still; saveWaiting(); }
  }

  const asLine = (row: ThreadFileMark): (SharedLine & { uid: string; patch: { artifact: Mark } }) | null => {
    const artifact = cleanMark(row.mark);
    return artifact ? { id: row.threadId, ts: row.at, source: 'system', by: row.by, uid: `mark-${row.id}`, patch: { artifact } } : null;
  };

  /** Everything marked on one teammate's thread: what its owner published, what the cloud holds, what is waiting to go. */
  function markLines(owner: string, threadId: string, local: LocalThread | null): SharedLine[] {
    const out = new Map<string, SharedLine>();
    for (const l of local?.marks ?? []) out.set(l.uid ?? `${l.ts}-${out.size}`, l);
    const here = (m: ThreadFileMark) => m.owner === owner && m.threadId === threadId;
    for (const m of [...fileMarks.filter(here), ...(waiting ?? waitingMarks()).filter(here)]) {
      const line = asLine(m);
      if (line && line.patch.artifact.do !== 'edit' && !out.has(line.uid)) out.set(line.uid, line);
    }
    return [...out.values()].sort((a, b) => a.ts - b.ts);
  }

  // A few parts of a big file each pass, kept apart until all are here; then
  // put back together and checked against the name it was given.
  const chunkFolder = (dir: string, f: BigFile) => path.join(dir, '.parts', f.name);
  const partsHere = (dir: string, f: BigFile) => f.parts.filter((n) => fs.existsSync(path.join(chunkFolder(dir, f), n))).length;
  async function takeBig(head: ThreadHead, f: BigFile, dir: string, file: string): Promise<boolean> {
    const folder = chunkFolder(dir, f);
    let got = 0;
    for (const n of f.parts) {
      if (got >= PIECES_PER_PASS) break;
      if (fs.existsSync(path.join(folder, n))) continue;
      const data = await backend.getThreadFile(head.personId, head.threadId, n);
      const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : null;
      if (!bytes || bytes.length > PART_BYTES) continue;
      fs.mkdirSync(folder, { recursive: true });
      const tmp = path.join(folder, `${n}.${process.pid}.tmp`);
      fs.writeFileSync(tmp, bytes);
      fs.renameSync(tmp, path.join(folder, n));
      got += 1;
    }
    if (partsHere(dir, f) < f.parts.length) return got > 0;
    const hash = crypto.createHash('sha256');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, 'w');
    try {
      for (const n of f.parts) { const bytes = fs.readFileSync(path.join(folder, n)); hash.update(bytes); fs.writeSync(fd, bytes); }
    } finally { fs.closeSync(fd); }
    const right = f.name.startsWith(`${hash.digest('hex').slice(0, 12)}-`);
    if (right) fs.renameSync(tmp, file); else { fs.rmSync(tmp, { force: true }); log(`team threads: ${f.name} did not match its name once put together`); }
    fs.rmSync(folder, { recursive: true, force: true });
    return right;
  }

  async function take(heads: ThreadHead[]) {
    const theirs = heads.filter((h) => h.personId !== me && THREAD_ID.test(h.personId) && THREAD_ID.test(h.threadId));
    let fetched = 0;
    let changed = false;
    for (const head of theirs) {
      const dir = folderOf(head.personId, head.threadId);
      let local = readLocal(head.personId, head.threadId);
      if (local?.hash !== head.hash && fetched < THREADS_PER_PASS) {
        fetched += 1;
        const row = await quietly(`taking ${head.threadId}`, () => backend.getThreadWork(head.personId, head.threadId));
        if (row) {
          local = { hash: head.hash, ...cleaned(row.work as RawWork | null) };
          fs.mkdirSync(dir, { recursive: true });
          const tmp = `${fileOf(head.personId, head.threadId)}.${process.pid}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(local));
          fs.renameSync(tmp, fileOf(head.personId, head.threadId));
          changed = true;
        }
      }
      if (!local) continue;
      const folder = path.join(dir, 'attachments');
      const want = new Set(local.files);
      const bigOnes = new Map((local.big ?? []).map((f) => [f.name, f]));
      for (const name of local.files) {
        const file = path.join(folder, name);
        if (fs.existsSync(file)) continue;
        if (bigOnes.has(name)) {
          if (await quietly(`taking ${name}`, () => takeBig(head, bigOnes.get(name)!, dir, file), false)) changed = true;
          continue;
        }
        const data = await quietly(`taking ${name}`, () => backend.getThreadFile(head.personId, head.threadId, name));
        const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : null;
        if (!bytes || bytes.length > MAX_THREAD_FILE_BYTES) continue;
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(file, bytes);
        changed = true;
      }
      let present: string[] = [];
      try { present = fs.readdirSync(folder); } catch { /* no files yet */ }
      for (const name of present) if (!want.has(name)) fs.rmSync(path.join(folder, name), { force: true });
    }
    // What you can no longer read does not stay on this computer either.
    const open = new Set(theirs.map((h) => `${h.personId}/${h.threadId}`));
    for (const [owner, threadId] of localThreads()) {
      if (open.has(`${owner}/${threadId}`)) continue;
      fs.rmSync(folderOf(owner, threadId), { recursive: true, force: true });
      changed = true;
    }
    if (changed) onChange();
  }

  function localThreads(): [owner: string, threadId: string][] {
    const out: [string, string][] = [];
    let owners: string[] = [];
    try { owners = fs.readdirSync(root); } catch { return out; }
    for (const owner of owners) {
      let threads: string[] = [];
      try { threads = fs.readdirSync(path.join(root, owner)); } catch { continue; }
      for (const t of threads) out.push([owner, t]);
    }
    return out;
  }

  function deliver() {
    const unsaid = comments.filter((c) => c.owner === me && !delivered.has(c.id));
    if (!unsaid.length && fileMarks.every((m) => m.owner !== me || m.by === me || deliveredMarks.has(m.id))) return;
    const threads = listThreads();
    let added = 0;
    for (const c of unsaid) {
      const thread = threads.get(c.threadId);
      if (!thread) continue;
      // The name is for the owner's agent, which has no team list to look it up in.
      const name = nameOf(c.by);
      added += disk.appendForeignLines(thread.product.dir, [{
        id: c.threadId, ts: c.at, source: 'system', by: c.by, uid: `comment-${c.id}`, patch: { comment: { text: c.text, ...(name ? { name } : {}) } },
      }]);
      delivered.add(c.id);
    }
    for (const m of fileMarks) {
      if (m.owner !== me || m.by === me || deliveredMarks.has(m.id)) continue;
      const thread = threads.get(m.threadId);
      const line = thread ? asLine(m) : null;
      if (!thread) continue;
      deliveredMarks.add(m.id);
      if (!line) continue;
      const edit = line.patch.artifact;
      if (edit.do === 'edit') {
        // Only words become a file: a path on a teammate's mark is never believed.
        if (!edit.text) continue;
        const saved = saveNextVersion({ dir: thread.product.dir, threadId: m.threadId, lines: historyOf(thread.product.slug, m.threadId), baseId: edit.file, text: edit.text, by: m.by });
        if (!saved.ok) { log(`team threads: an edit to ${edit.file} was not saved: ${saved.error}`); continue; }
        if (saved.unchanged) continue;
        line.patch.artifact = { do: 'edit', file: saved.file, path: saved.path, ...(saved.over ? { over: saved.over } : {}) };
      }
      // On your thread the file is yours, whatever their copy said.
      delete (line.patch.artifact as { owner?: string }).owner;
      added += disk.appendForeignLines(thread.product.dir, [line]);
    }
    if (added) onChange();
  }

  const slugOf = (owner: string, threadId: string) => `${SHARED_PREFIX}:${owner}:${threadId}`;

  return {
    /** One pass. Nothing here may stop a sync. */
    async pass(teamId) {
      if (!backend.threadWorkHeads || !teamId) return;
      const heads = await quietly('reading what is shared', () => backend.threadWorkHeads!());
      if (!heads) return;
      await publish(teamId, heads);
      await take(heads);
      if (backend.fileMarks) await sendWaiting(heads);
      comments = await quietly('reading comments', () => backend.threadComments(), comments);
      if (backend.fileMarks) fileMarks = await quietly('reading notes on files', () => backend.fileMarks!(), fileMarks);
      deliver();
    },

    /** What a window draws for a teammate's thread. Never reaches the cloud. */
    read(owner, threadId) {
      const ok = THREAD_ID.test(String(owner)) && THREAD_ID.test(String(threadId));
      const local = ok ? readLocal(owner, threadId) : null;
      const carried = new Set((local?.lines ?? []).map((l) => l.uid).filter(Boolean));
      const theirs = comments.filter((c) => c.owner === owner && c.threadId === threadId && !carried.has(`comment-${c.id}`)).map((c): SharedLine => ({
        id: threadId, ts: c.at, source: 'system', by: c.by, uid: `comment-${c.id}`, patch: { comment: { text: c.text } },
      }));
      return {
        shared: !!local,
        lines: [...(local?.lines ?? []), ...theirs, ...(ok && local ? markLines(owner, threadId, local) : [])],
        earlier: local?.earlier ?? 0,
        product: ok ? slugOf(owner, threadId) : null,
        dir: ok ? folderOf(owner, threadId) : null,
      };
    },

    /** The shared threads on disk, each with a stamp that changes when its words, comments or notes do. */
    folders() {
      return localThreads().map(([ownerId, threadId]) => {
        let at = 0;
        try { at = fs.statSync(fileOf(ownerId, threadId)).mtimeMs; } catch { /* not taken yet */ }
        const here = (m: { owner: string; threadId: string }) => m.owner === ownerId && m.threadId === threadId;
        return { ownerId, threadId, version: `${at}:${comments.filter(here).length}:${fileMarks.filter(here).length}` };
      });
    },

    /** Each thread's folder as a project the file pane can read. Not on any list of projects, so never written to. */
    products() {
      return localThreads().map(([owner, threadId]) => ({ slug: slugOf(owner, threadId), name: 'Shared thread', dir: folderOf(owner, threadId) }));
    },

    /**
     * A file some teammate's thread here names, by the sha256 of its bytes: its
     * copy in that thread's folder, or with `fetch` taken from the cloud the way
     * a pass takes it. Only a thread on this computer is asked about, and a
     * thread is only here while its card can be read.
     */
    async fileByHash(hash, { fetch = false } = {}) {
      if (!/^[0-9a-f]{64}$/.test(String(hash))) return null;
      const sumOf = (file: string) => { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return null; } };
      const named = localThreads().flatMap(([owner, threadId]) => {
        const local = readLocal(owner, threadId);
        const big = new Set((local?.big ?? []).map((f) => f.name));
        return (local?.files ?? []).filter((n) => n.startsWith(`${hash.slice(0, 12)}-`) && FILE_NAME.test(n) && !big.has(n))
          .map((name) => ({ owner, threadId, name, file: path.join(folderOf(owner, threadId), 'attachments', name) }));
      });
      for (const n of named) if (fs.existsSync(n.file) && sumOf(n.file) === hash) return n.file;
      if (!fetch) return null;
      for (const n of named) {
        const asked = `${n.owner}/${n.threadId}/${n.name}`;
        // Every open view asks on each change in the app; one the cloud did not give waits for the next look.
        if (fs.existsSync(n.file) || now() - (missed.get(asked) ?? -Infinity) < LOOK_AGAIN_MS) continue;
        missed.set(asked, now());
        const data = await quietly(`taking ${n.name}`, () => backend.getThreadFile(n.owner, n.threadId, n.name));
        const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : null;
        if (!bytes || bytes.length > MAX_THREAD_FILE_BYTES || crypto.createHash('sha256').update(bytes).digest('hex') !== hash) continue;
        fs.mkdirSync(path.dirname(n.file), { recursive: true });
        const tmp = `${n.file}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, bytes);
        fs.renameSync(tmp, n.file);
        missed.delete(asked);
        return n.file;
      }
      return null;
    },

    /** Kept on disk first, then sent; a failed send waits for the next pass. */
    async addMark(owner, threadId, mark) {
      const clean = cleanMark(mark);
      if (!clean || !THREAD_ID.test(String(owner)) || !THREAD_ID.test(String(threadId))) return false;
      const id = crypto.randomUUID();
      const row: ThreadFileMark = { id, owner, threadId, by: me, mark: clean, at: now() };
      waiting = [...waitingMarks(), row];
      saveWaiting();
      await sendWaiting(null);
      fileMarks = await quietly('reading notes on files', () => backend.fileMarks!(), fileMarks);
      return true;
    },

    /** Notes on teammates' threads that name this person and wait on them: rows in their Needs you. */
    fileNews() {
      const out: ThreadFileNews[] = [];
      for (const [owner, threadId] of localThreads()) {
        const local = readLocal(owner, threadId);
        if (!local) continue;
        const entries = markLines(owner, threadId, local).map((l) => ({ ...l.patch.artifact, by: l.by ?? null, ts: l.ts, uid: l.uid ?? null }));
        const news = fileNewsFor({ artifacts: marksOf(entries), createdBy: owner }, me, { myName: myName() });
        for (const n of news) if (n.kind === 'named') out.push({ owner, threadId, id: n.id, file: n.file, text: n.text, by: n.by, ts: n.ts });
      }
      return out;
    },

    /**
     * Every comment, and every note or note reply that is for someone, this person
     * may read, theirs included. A note on your own file lives only on your own
     * thread, so published threads are read as well as marks on copies; a mark on
     * a copy is on the owner's thread too once delivered, so each is kept once.
     */
    talk() {
      const out: ThreadTalk[] = comments.map((c) => ({ id: c.id, kind: 'comment' as const, owner: c.owner, threadId: c.threadId, by: c.by, text: c.text, at: c.at }));
      type Said = { id: string; owner: string; threadId: string; by: string; at: number; mark: Mark; theirs?: true };
      const all: Said[] = [];
      for (const m of [...fileMarks, ...(waiting ?? waitingMarks())]) {
        const mark = cleanMark(m.mark);
        if (mark) all.push({ id: m.id, owner: m.owner, threadId: m.threadId, by: m.by, at: m.at, mark });
      }
      const fromLines = (owner: string, threadId: string, lines: readonly { ts: number; by?: string; uid?: string; patch: { artifact?: unknown } }[], theirs: boolean) => {
        for (const l of lines) {
          const mark = cleanMark(l.patch.artifact);
          if (!mark || !l.by || (mark.do !== 'note' && mark.do !== 'reply')) continue;
          const id = l.uid?.startsWith('mark-') ? l.uid.slice('mark-'.length) : mark.id;
          all.push({ id, owner, threadId, by: l.by, at: l.ts, mark, ...(theirs ? { theirs: true as const } : {}) });
        }
      };
      for (const [threadId, b] of built) if (readers.has(threadId)) fromLines(me, threadId, b.work.marks ?? [], false);
      for (const [owner, threadId] of localThreads()) fromLines(owner, threadId, readLocal(owner, threadId)?.marks ?? [], true);

      const notes = new Map<string, { by: string; file: string }>();
      for (const s of all) if (s.mark.do === 'note') notes.set(`${s.owner}:${s.threadId}:${s.mark.id}`, { by: s.by, file: s.mark.file });
      const seen = new Set<string>();
      for (const s of all) {
        const { mark } = s;
        if (mark.do !== 'note' && mark.do !== 'reply') continue;
        const key = `${s.owner}:${s.threadId}:${mark.do}:${mark.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const answers = mark.do === 'reply' ? notes.get(`${s.owner}:${s.threadId}:${mark.on}`) : undefined;
        // A note on your own file is for whom it names; `wait` only holds it for your agent as well.
        let to = [...new Set([s.owner, ...(mark.do === 'note' ? mark.mentions ?? [] : [answers?.by])])].filter((p): p is string => !!p && p !== s.by);
        if (s.owner === me) {
          const may = readers.get(s.threadId);
          to = to.filter((p) => p === me || may === null || may?.includes(p));
        }
        if (!to.length || (s.theirs && s.by !== me && !to.includes(me))) continue;
        out.push({ id: s.id, kind: 'note', owner: s.owner, threadId: s.threadId, by: s.by, text: mark.text, at: s.at, file: answers?.file ?? mark.file, note: mark.do === 'note' ? mark.id : mark.on, to });
      }
      return out.sort((a, b) => a.at - b.at);
    },

    /** After a comment, so its writer sees it without waiting for the next pass. */
    async refreshComments() {
      comments = await quietly('reading comments', () => backend.threadComments(), comments);
    },
  };
}

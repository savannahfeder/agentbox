// WHERE FILES THAT CAME WITH A MESSAGE ARE KEPT ON THIS COMPUTER, AND WHICH NAME
// OPENS WHICH.
//
// `<conversation>/attachments/carried/<key>/…`, one folder per sent version, so
// a document's own pictures keep their place beside it and two files of one name
// never meet. `index.json` maps the name a message wrote to that folder. A list
// comes from a teammate's line, so `validEntry` is what stands between it and
// this disk.
import crypto from 'node:crypto';
import fsDefault from 'node:fs';
import path from 'node:path';
import { MAX_CARRIED_BYTES, MAX_SENT_BYTES, PART_BYTES, plainRef } from '../../shared/carried-files.mts';
import type { CarryState } from '../../shared/carried-files.mts';

const CLOUD_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
const SEGMENT = /^[A-Za-z0-9_(][\w .()-]{0,159}$/;
const MAX_ENTRIES = 2000;
const WHY = new Set(['missing', 'secret', 'outside', 'hidden', 'upload', 'tooBig', 'name']);
const MAX_CHUNKS = Math.ceil(MAX_SENT_BYTES / PART_BYTES);

type Fs = typeof fsDefault;

export interface CarriedChunk { cloud: string; size: number }

export interface CarriedPart {
  path: string;
  cloud: string;
  size: number;
  chunks?: CarriedChunk[];
  bucket?: boolean;
}

interface CarriedBase {
  ref: string;
  at: number;
  tooBig?: number;
  cannot?: boolean;
  why?: string;
  quiet?: boolean;
  damaged?: boolean;
  mine?: boolean;
  here?: string;
  coming?: boolean;
  done?: number;
  total?: number;
  failed?: boolean;
  expecting?: boolean;
  by?: string;
}

export interface CarriedFileEntry extends CarriedBase { main: string; parts: CarriedPart[] }

export interface CarriedNoteEntry extends CarriedBase { main?: undefined; parts?: undefined }

export type CarriedEntry = CarriedFileEntry | CarriedNoteEntry;

const folderOf = (dir: string) => path.join(dir, 'attachments', 'carried');

/** A path of plain folder names, with no way up and nothing hidden. */
export const plainPartPath = (p: unknown): p is string => typeof p === 'string' && p.length < 600 && p.split('/').every((s) => SEGMENT.test(s));

export function entryKey(entry: Pick<CarriedFileEntry, 'parts'>): string {
  return crypto.createHash('sha256').update(entry.parts.map((p) => p.cloud).join('\n')).digest('hex').slice(0, 16);
}

export function partFile(dir: string, entry: Pick<CarriedFileEntry, 'parts'>, part: Pick<CarriedPart, 'path'>): string {
  return path.join(folderOf(dir), entryKey(entry), part.path);
}

/** Where one piece of a big file waits until all of them are here. Hidden, so it is never a name a message can reach. */
export function chunkFile(dir: string, entry: Pick<CarriedFileEntry, 'parts'>, part: CarriedPart, chunk: CarriedChunk): string {
  return path.join(folderOf(dir), entryKey(entry), '.chunks', chunk.cloud);
}

export interface RawCarriedEntry {
  ref?: unknown;
  at?: unknown;
  tooBig?: unknown;
  cannot?: unknown;
  why?: unknown;
  quiet?: unknown;
  main?: unknown;
  parts?: unknown;
}
interface RawPart { cloud?: unknown; path?: unknown; size?: unknown; chunks?: unknown; bucket?: unknown }
interface RawChunk { cloud?: unknown; size?: unknown }

/** The entry with only what a teammate may hand this computer, or null. */
export function validEntry(raw: RawCarriedEntry | null | undefined): CarriedEntry | null {
  if (!raw || typeof raw !== 'object' || typeof raw.ref !== 'string' || !raw.ref || raw.ref.length > 1000) return null;
  const at = Number.isFinite(raw.at) ? raw.at as number : 0;
  if (Number.isFinite(raw.tooBig) && (raw.tooBig as number) > 0) return { ref: raw.ref, tooBig: raw.tooBig as number, at };
  if (raw.cannot === true) return { ref: raw.ref, cannot: true, ...(WHY.has(raw.why as string) ? { why: raw.why as string } : {}), at };
  if (raw.quiet === true) return { ref: raw.ref, quiet: true, at };
  if (!Array.isArray(raw.parts) || !raw.parts.length || raw.parts.length > 60 || !plainPartPath(raw.main)) return null;
  const parts: CarriedPart[] = [];
  for (const p of raw.parts as (RawPart | null)[]) {
    if (!p || !CLOUD_NAME.test(String(p.cloud)) || !plainPartPath(p.path)) return null;
    const size = Number(p.size) || 0;
    if (size > MAX_SENT_BYTES) return null;
    let chunks: CarriedChunk[] | undefined;
    if (Array.isArray(p.chunks) && p.chunks.length) {
      if (p.chunks.length > MAX_CHUNKS) return null;
      chunks = [];
      for (const c of p.chunks as (RawChunk | null)[]) {
        if (!c || !CLOUD_NAME.test(String(c.cloud))) return null;
        const bytes = Number(c.size) || 0;
        if (bytes > MAX_CARRIED_BYTES) return null;
        chunks.push({ cloud: c.cloud as string, size: bytes });
      }
    }
    // `bucket`: the pieces are in storage. A list from before it has them as rows.
    parts.push({ path: p.path, cloud: p.cloud as string, size, ...(chunks ? { chunks, ...(p.bucket === true ? { bucket: true } : {}) } : {}) });
  }
  if (!parts.some((p) => p.path === raw.main)) return null;
  return { ref: raw.ref, main: raw.main, parts, at };
}

function readIndex(dir: string, fs: Fs): CarriedEntry[] {
  try { const got = JSON.parse(fs.readFileSync(path.join(folderOf(dir), 'index.json'), 'utf8')); return Array.isArray(got) ? got : []; } catch { return []; }
}

/** Keeps the newest word on each name. Your own copy keeps where the original is. */
export function shelve(dir: string, entries: CarriedEntry[], { fs = fsDefault }: { fs?: Fs } = {}): void {
  const held = new Map(readIndex(dir, fs).map((e) => [e.ref, e]));
  for (const entry of entries) {
    const was = held.get(entry.ref);
    // A guess that a file is coming never outranks what the sender said, whatever the clocks read.
    if (was && was.at > entry.at && !was.expecting) continue;
    const same = was && JSON.stringify(was.parts ?? was.tooBig ?? null) === JSON.stringify(entry.parts ?? entry.tooBig ?? null);
    held.delete(entry.ref);
    held.set(entry.ref, { ...entry, ...(same && was.mine ? { mine: true } : {}), ...(same && was.here ? { here: was.here } : {}) });
  }
  const folder = folderOf(dir);
  fs.mkdirSync(folder, { recursive: true });
  const tmp = path.join(folder, `index.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify([...held.values()].slice(-MAX_ENTRIES)));
  fs.renameSync(tmp, path.join(folder, 'index.json'));
}

export const shelvedEntries = (dir: string, { fs = fsDefault }: { fs?: Fs } = {}): CarriedEntry[] => readIndex(dir, fs);

/** What this conversation knows about a name, newest first: the exact name, else one of the same file name. */
export function shelvedFor(dir: string, src: unknown, { fs = fsDefault }: { fs?: Fs } = {}): CarriedEntry | null {
  const ref = plainRef(src);
  const entries = readIndex(dir, fs);
  const exact = entries.find((e) => e.ref === ref);
  if (exact) return exact;
  const base = path.basename(ref);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (path.basename(entries[i].ref) === base) return entries[i];
  }
  return null;
}

// A file the sender has not said anything about yet is "on its way" for this
// long; after it, the tile says whose computer it is waiting for.
export const OFFLINE_AFTER_MS = 90_000;

/**
 * How a name got (or is getting) to the people on the conversation, for its
 * tile: `{ state: 'sent' | 'coming' | 'offline' | 'failed', mine, why, done,
 * total, by }`, or null when there is nothing to say (a file that arrived
 * whole on a reader's computer).
 */
export function carryOf(entry: CarriedEntry | null | undefined, { dir, nameOf = () => null, now = Date.now(), fs = fsDefault }: {
  dir?: string;
  nameOf?: (id: string | undefined) => string | null | undefined;
  now?: number;
  fs?: Fs;
} = {}): CarryState | null {
  if (!entry) return null;
  const mine = !!entry.mine;
  if (entry.parts) {
    const part = entry.parts.find((p) => p.path === entry.main) ?? entry.parts[0];
    if (fs.existsSync(partFile(dir!, entry, part))) return mine ? { state: 'sent', mine } : null;
    if (mine && entry.here && fs.existsSync(entry.here)) return { state: 'sent', mine };
    if (entry.damaged) return { state: 'failed', mine, why: 'damaged' };
    const total = part.chunks?.length ?? 0;
    const done = total ? part.chunks!.filter((c) => fs.existsSync(chunkFile(dir!, entry, part, c))).length : 0;
    return { state: 'coming', mine, ...(total ? { done, total } : {}) };
  }
  if (entry.tooBig) return { state: 'failed', mine, why: 'tooBig' };
  if (entry.cannot) return { state: 'failed', mine, why: entry.why ?? 'missing' };
  if (entry.failed) return { state: 'failed', mine: true, why: entry.why ?? 'upload' };
  if (entry.coming) return { state: 'coming', mine: true, ...(entry.total ? { done: entry.done ?? 0, total: entry.total } : {}) };
  if (entry.expecting) {
    return now - (entry.at ?? 0) > OFFLINE_AFTER_MS ? { state: 'offline', by: nameOf(entry.by) ?? undefined } : { state: 'coming' };
  }
  return null;
}

/**
 * A file of a shared thread that its owner's copy has said is part of the thread
 * but that has not landed here: `{ state: 'coming', done, total }` for a big
 * one, so its tile can say how far it has come. Null when the thread does not
 * list it.
 */
export function threadFileComing(dir: string, name: string, { fs = fsDefault }: { fs?: Fs } = {}): CarryState | null {
  let work: { files?: unknown; big?: ({ name?: unknown; parts: string[] } | null)[] } | null;
  try { work = JSON.parse(fs.readFileSync(path.join(dir, 'thread.json'), 'utf8')); } catch { return null; }
  if (!Array.isArray(work?.files) || !work.files.includes(name)) return null;
  const big = (work.big ?? []).find((f) => f?.name === name);
  if (!big) return { state: 'coming' };
  const done = big.parts.filter((n) => fs.existsSync(path.join(dir, '.parts', name, n))).length;
  return { state: 'coming', done, total: big.parts.length };
}

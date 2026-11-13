// PURE. Comments, approvals and versions of the files on a thread.
//
// A mark is the `artifact` field of one ledger line, a delta like `react`. The
// fold keeps every mark and hands them here to read back as `item.artifacts`.
// `file` is a version's id, the same on the owner's computer and a teammate's,
// where one file has two paths and two names (versionId below).

import { PLAIN_AGENT } from './agent-voice.mts';

export type NotePlace =
  | { kind: 'pin'; x: number; y: number }
  | { kind: 'time'; s: number; x?: number; y?: number }
  | { kind: 'page'; n: number; word?: 'Slide'; x?: number; y?: number }
  /** `cell`: a table's row in the file, counted from 1 under the header, and its column's name. */
  | { kind: 'quote'; text: string; cell?: { row: number; column: string }; x?: undefined; y?: undefined }
  | { kind: 'whole'; x?: undefined; y?: undefined };

export type Mark =
  | { do: 'note'; id: string; file: string; place: NotePlace; text: string; mentions?: string[]; owner?: string; wait?: boolean }
  | { do: 'reply'; id: string; on: string; file: string; text: string }
  | { do: 'resolve' | 'reopen'; on: string; in?: string }
  | { do: 'approve' | 'unapprove'; file: string; owner?: string }
  | { do: 'seen' | 'sent' | 'toagent'; on: string[] }
  | { do: 'edit'; file: string; path?: string; over?: string; text?: string }
  | { do: 'reconcile'; file: string; path?: string; missed?: string; from?: string; clash?: number; replace?: boolean };

export type MarkKind = Mark['do'];

// Loose on purpose: callers gather marks from ledger lines that carry no type.
export interface MarkEntry {
  do?: string;
  id?: string;
  file?: string;
  path?: string;
  place?: NotePlace;
  text?: string;
  mentions?: readonly string[];
  owner?: string;
  on?: string | readonly string[];
  wait?: boolean;
  in?: string;
  over?: string;
  missed?: string;
  from?: string;
  clash?: number;
  replace?: boolean;
  by?: string | null;
  ts: number;
  uid?: string | null;
}

type StampedMark = Mark & { by?: string | null; ts: number; uid?: string | null };

export interface FileReply { id: string; text: string; by: string | null; ts: number; sent?: boolean }

export interface FileNote {
  id: string;
  file: string;
  place: NotePlace;
  text: string;
  by: string | null;
  ts: number;
  mentions: string[];
  owner: string | null;
  uid: string | null;
  pin?: number;
  wait?: boolean;
  sent?: boolean;
  toAgent?: boolean;
  replies?: FileReply[];
  resolved?: boolean;
  resolvedBy?: string | null;
  resolvedIn?: string;
}

export interface FileApproval { file: string; by: string | null; ts: number; owner: string | null }

export interface FileEdit { file: string; path: string; by: string | null; ts: number }

export interface FileMarks {
  notes: FileNote[];
  approvals: FileApproval[];
  seen: Record<string, string[]>;
  edits?: FileEdit[];
}

export interface LinePatch {
  artifact?: Mark | null;
  voice?: { name?: string } | null;
  [field: string]: unknown;
}

export interface ThreadLine {
  id?: string;
  ts: number;
  by?: string | null;
  source?: string;
  uid?: string | null;
  patch?: LinePatch | null;
}

export interface ThreadFile { path: string; by?: string | null; at?: number; agent?: string; edited?: boolean; newer?: boolean; made?: boolean }

export interface NamedFile extends ThreadFile { by: string | null; at: number }

/** `agent` is set when an agent shared it: its name, or empty when it has none. `newer`: made in another place after this thread's own. */
export interface FileVersion {
  id: string;
  name: string;
  path: string;
  n: number;
  by: string | null;
  at: number;
  agent?: string;
  edited?: boolean;
  made?: boolean;
  newer?: boolean;
  also?: string[];
}

export interface FileFamily { key: string; versions: FileVersion[] }

/** A thread's file as its version line numbers it. `path` is null where only a teammate has that version; `here` is how this thread named it. */
export interface FileLine {
  key: string;
  versions: Array<{ n: number; name: string; path: string | null; by: string | null; at: number; agent?: string; here: string[] }>;
}

export interface FileStep { fi: number; vi: number }

export type ReviewKind = 'image' | 'film' | 'pdf' | 'markdown' | 'deck';
export type OtherKind = 'page' | 'table' | 'code';
export type ViewKind = ReviewKind | OtherKind;

export interface FileNews {
  kind: 'note' | 'named' | 'reply' | 'approved';
  id: string;
  on?: string;
  by: string | null;
  ts: number;
  file: string;
  text?: string;
}

export interface FileNewsRow {
  artifacts?: FileMarks | null;
  runner?: string | null;
  createdBy?: string | null;
  people?: readonly string[] | null;
  status?: string;
  wrote?: Readonly<Record<string, { by?: string | null; ts: number } | undefined>> | null;
}

export interface NotePerson { id: string; name?: string | null }

export type NoteTarget = { to: 'agent' } | { to: 'person'; person: string } | { to: 'nobody' };

type NameOf = (id: string | null) => string;

const MARK_ID = /^[\w-]{1,64}$/;
const FILE_ID = /^[^/\\\0]{1,160}$/;
const MAX_NOTE_CHARS = 4000;
// A whole section. With a full note, both in three-byte characters, still under the cloud's 24,000 for one mark.
export const MAX_QUOTE_CHARS = 3000;
const MAX_NAMED = 12;
const MAX_SEEN = 50;
// Under the 24,000 the cloud allows one mark, with room for the rest of it.
export const MAX_EDIT_BYTES = 20_000;
const byteLength = (s: string): number => new TextEncoder().encode(s).length;
const documentPath = (v: unknown): string | null => (typeof v === 'string' && !v.startsWith('/') && !v.split('/').includes('..') && /\.(?:md|markdown)$/i.test(v) && v.length <= 400 ? v : null);

const shortId = (v: unknown): string | null => (typeof v === 'string' && MARK_ID.test(v) ? v : null);
const fileId = (v: unknown): string | null => (typeof v === 'string' && FILE_ID.test(v) && v !== '.' && v !== '..' ? v : null);
const unit = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;

export type RawPlace = { kind?: unknown; x?: unknown; y?: unknown; s?: unknown; n?: unknown; word?: unknown; text?: unknown; cell?: { row?: unknown; column?: unknown } | null };

/** A place as a note or a link comment may name it, or undefined. */
export function cleanPlace(place: RawPlace | null | undefined): NotePlace | undefined {
  switch (place?.kind) {
    case 'pin': return unit(place.x) && unit(place.y) ? { kind: 'pin', x: place.x, y: place.y } : undefined;
    case 'time':
      if (!Number.isFinite(place.s) || (place.s as number) < 0) return undefined;
      return unit(place.x) && unit(place.y) ? { kind: 'time', s: place.s as number, x: place.x, y: place.y } : { kind: 'time', s: place.s as number };
    case 'page': {
      if (!Number.isInteger(place.n) || (place.n as number) < 1) return undefined;
      return { kind: 'page', n: place.n as number, ...(place.word === 'Slide' ? { word: 'Slide' as const } : {}), ...(unit(place.x) && unit(place.y) ? { x: place.x, y: place.y } : {}) };
    }
    case 'quote': {
      const text = typeof place.text === 'string' ? place.text.trim().slice(0, MAX_QUOTE_CHARS) : '';
      if (!text) return undefined;
      const row = place.cell?.row;
      const column = typeof place.cell?.column === 'string' ? place.cell.column.trim().slice(0, 200) : '';
      return typeof row === 'number' && Number.isInteger(row) && row >= 1 && column ? { kind: 'quote', text, cell: { row, column } } : { kind: 'quote', text };
    }
    case 'whole': return { kind: 'whole' };
    default: return undefined;
  }
}

/** A mark as the ledger may hold it, or undefined. A teammate's copy wrote it, so nothing is believed. */
export function cleanMark(raw: unknown): Mark | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const owner = shortId(value.owner);
  switch (value.do) {
    case 'note': {
      const id = shortId(value.id);
      const file = fileId(value.file);
      const place = cleanPlace(value.place as RawPlace | null | undefined);
      const text = typeof value.text === 'string' ? value.text.trim().slice(0, MAX_NOTE_CHARS) : '';
      if (!id || !file || !place || !text) return undefined;
      const mentions = Array.isArray(value.mentions) ? [...new Set(value.mentions.map(shortId).filter(Boolean) as string[])].slice(0, MAX_NAMED) : [];
      // `wait`: held for Send rather than told to the agent as it is added.
      return { do: 'note', id, file, place, text, ...(mentions.length ? { mentions } : {}), ...(owner ? { owner } : {}), ...(value.wait === true ? { wait: true } : {}) };
    }
    case 'reply': {
      const id = shortId(value.id);
      const on = shortId(value.on);
      const file = fileId(value.file);
      const text = typeof value.text === 'string' ? value.text.trim().slice(0, MAX_NOTE_CHARS) : '';
      return id && on && file && text ? { do: 'reply', id, on, file, text } : undefined;
    }
    case 'resolve': case 'reopen': {
      const on = shortId(value.on);
      // `in`: the version that answered it, when the app resolved it rather than a press.
      const answeredIn = value.do === 'resolve' ? fileId(value.in) : null;
      return on ? { do: value.do, on, ...(answeredIn ? { in: answeredIn } : {}) } : undefined;
    }
    case 'approve': case 'unapprove': {
      const file = fileId(value.file);
      return file ? { do: value.do, file, ...(owner ? { owner } : {}) } : undefined;
    }
    case 'seen': case 'sent': case 'toagent': {
      const on = (Array.isArray(value.on) ? value.on : []).map(shortId).filter(Boolean).slice(0, MAX_SEEN) as string[];
      return on.length ? { do: value.do, on } : undefined;
    }
    // `path` once the owner's copy has written the file; `text` on its way there
    // from a teammate, whose copy has nowhere else to put it.
    case 'edit': {
      const file = fileId(value.file);
      if (!file) return undefined;
      const over = fileId(value.over);
      if (value.path !== undefined) {
        const path = documentPath(value.path);
        return path ? { do: 'edit', file, path, ...(over ? { over } : {}) } : undefined;
      }
      const text = typeof value.text === 'string' && value.text.trim() && byteLength(value.text) <= MAX_EDIT_BYTES ? value.text : null;
      return text ? { do: 'edit', file, text } : undefined;
    }
    // What was decided about an agent's version that skipped someone's edit (main/version-reconcile.mts).
    case 'reconcile': {
      const file = fileId(value.file);
      if (!file) return undefined;
      const path = value.path !== undefined ? documentPath(value.path) : null;
      const missed = value.missed !== undefined ? documentPath(value.missed) : null;
      const from = fileId(value.from);
      return { do: 'reconcile', file, ...(path ? { path } : {}), ...(missed ? { missed } : {}), ...(from ? { from } : {}), ...(Number.isInteger(value.clash) && (value.clash as number) > 0 ? { clash: value.clash as number } : {}), ...(value.replace === true ? { replace: true } : {}) };
    }
    default: return undefined;
  }
}

/** Only that this person has looked at something, which is nothing anyone else needs to read. */
export const isBookkeepingMark = (mark: { do?: unknown } | null | undefined): boolean => mark?.do === 'seen' || mark?.do === 'sent' || mark?.do === 'reconcile';

/**
 * Every mark on a thread, oldest first, as what it now says. Each entry is the
 * mark plus the `by` and `ts` of its line. The first note under an id stands, so
 * a later line cannot rewrite one, and only the approver can take an approval back.
 */
export function marksOf(entries: readonly MarkEntry[] | null | undefined): FileMarks {
  const notes = new Map<string, FileNote>();
  const given = new Map<string, FileApproval & { on: boolean }>();
  const pins = new Map<string, number>();
  const seen = new Map<string, Set<string>>();
  const sent = new Set<string>();
  const toAgent = new Set<string>();
  const settled = new Map<string, { ts: number; by: string | null; resolved: boolean; in: string | null }>();
  const replies = new Map<string, FileReply & { on: string }>();
  const edits: FileEdit[] = [];
  for (const entry of entries ?? []) {
    // Every entry was let through cleanMark when its line was read.
    const e = entry as StampedMark;
    if (e.do === 'edit' && e.path) {
      edits.push({ file: e.file, path: e.path, by: e.by ?? null, ts: e.ts });
    } else if (e.do === 'note' && !notes.has(e.id)) {
      const note: FileNote = { id: e.id, file: e.file, place: e.place, text: e.text, by: e.by ?? null, ts: e.ts, mentions: e.mentions ?? [], owner: e.owner ?? null, uid: e.uid ?? null, ...(e.wait ? { wait: true } : {}) };
      if (e.place.kind === 'pin' || ((e.place.kind === 'time' || e.place.kind === 'page') && unit(e.place.x))) {
        const n = (pins.get(e.file) ?? 0) + 1;
        pins.set(e.file, n);
        note.pin = n;
      }
      notes.set(e.id, note);
    } else if (e.do === 'reply' && !replies.has(e.id)) {
      replies.set(e.id, { id: e.id, on: e.on, text: e.text, by: e.by ?? null, ts: e.ts });
    } else if (e.do === 'resolve' || e.do === 'reopen') {
      const was = settled.get(e.on);
      if (!was || e.ts >= was.ts) settled.set(e.on, { ts: e.ts, by: e.by ?? null, resolved: e.do === 'resolve', in: e.in ?? null });
    } else if (e.do === 'approve' || e.do === 'unapprove') {
      const key = `${e.file}\0${e.by ?? ''}`;
      const was = given.get(key);
      if (!was || e.ts >= was.ts) given.set(key, { file: e.file, by: e.by ?? null, ts: e.ts, on: e.do === 'approve', owner: e.owner ?? null });
    } else if (e.do === 'seen') {
      const who = e.by ?? '';
      if (!seen.has(who)) seen.set(who, new Set());
      for (const id of e.on) seen.get(who)!.add(id);
    } else if (e.do === 'sent') {
      for (const id of e.on) sent.add(id);
    } else if (e.do === 'toagent') {
      for (const id of e.on) toAgent.add(id);
    }
  }
  const answers = new Map<string, FileReply[]>();
  for (const r of [...replies.values()].sort((a, b) => a.ts - b.ts)) {
    if (!answers.has(r.on)) answers.set(r.on, []);
    answers.get(r.on)!.push({ id: r.id, text: r.text, by: r.by, ts: r.ts, ...(sent.has(r.id) ? { sent: true } : {}) });
  }
  const list = [...notes.values()].map((n): FileNote => {
    const s = settled.get(n.id);
    const out = { ...n, ...(sent.has(n.id) ? { sent: true } : {}), ...(toAgent.has(n.id) ? { toAgent: true } : {}), ...(answers.has(n.id) ? { replies: answers.get(n.id) } : {}) };
    return s?.resolved ? { ...out, resolved: true, resolvedBy: s.by, ...(s.in ? { resolvedIn: s.in } : {}) } : out;
  });
  return {
    notes: list,
    approvals: [...given.values()].filter((a) => a.on).map(({ on: _on, ...a }) => a),
    seen: Object.fromEntries([...seen].map(([who, ids]) => [who, [...ids]])),
    ...(edits.length ? { edits } : {}),
  };
}

/** An approval's name for `seen`: a person seeing it says nothing about a later press. */
export const approvalId = (a: Pick<FileApproval, 'ts'>): string => `a${Math.trunc(Number(a.ts) || 0)}`;

const clock = (s: number): string => {
  const whole = Math.floor(Number(s) || 0);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** "Pin 2", "0:12", "Slide 3", the quote, "Whole file". */
export function placeWords(note: { place?: NotePlace | null; pin?: number | string } | null | undefined): string {
  const place = note?.place;
  switch (place?.kind) {
    case 'pin': return `Pin ${note!.pin ?? 1}`;
    case 'time': return unit(place.x) ? `Pin ${note!.pin ?? 1} at ${clock(place.s)}` : clock(place.s);
    case 'page': return unit(place.x) ? `Pin ${note!.pin ?? 1} on ${place.word ?? 'Page'} ${place.n}` : `${place.word ?? 'Page'} ${place.n}`;
    case 'quote': return place.cell ? `“${place.text}” in row ${place.cell.row}, ${place.cell.column}` : `“${place.text}”`;
    default: return 'Whole file';
  }
}

/* --------------------------------- versions ------------------------------ */

// `<sha12>-name`, how a shared thread names its copy, and `<time>-<random>-name`,
// how a saved attachment is named: main/team/thread-share.mts, main/save-attachments.mts.
const COPY_PREFIX = /^[0-9a-f]{12}-/;
const SAVED_PREFIX = /^([a-z0-9]{8})-[a-z0-9]{1,6}-/;
// The stamp is Date.now() in base 36, so it must read as a moment the app could
// have saved at: "payments-auth-" and "bookings-empty-" fit the shape and are words.
const FIRST_SAVED_MS = Date.UTC(2025, 0, 1);
const DAY_MS = 86_400_000;
const savedStamp = (base: string): boolean => {
  const at = parseInt(SAVED_PREFIX.exec(base)?.[1] ?? '', 36);
  return at >= FIRST_SAVED_MS && at <= Date.now() + DAY_MS;
};

/** A file's name as a person gave it. */
// A copy carries a mark in its name: a thread's attachments, or a group's file as kept here.
const SENT_COPY = /(^|\/)(attachments|\.room-files)\//;

export function shownName(path: string | null | undefined): string {
  const clean = String(path ?? '').split(/[?#]/)[0];
  const base = clean.split('/').pop() ?? '';
  // A hash in front is a shared thread's copy, even when an agent names it bare.
  if (!SENT_COPY.test(clean) && !COPY_PREFIX.test(base)) return base;
  const rest = base.replace(COPY_PREFIX, '');
  return savedStamp(rest) ? rest.replace(SAVED_PREFIX, '') : rest;
}

// Notes written on a teammate's copy before shownName checked the stamp carry
// the name it gave then: `audit.md` for payments-auth-audit.md.
const nameBefore = (name: string): string => name.replace(SAVED_PREFIX, '');

const KINDS: ReadonlyArray<readonly [ReviewKind, RegExp]> = [
  ['image', /\.(png|jpe?g|gif|webp|svg)$/i],
  ['film', /\.(mp4|mov|m4v|webm)$/i],
  ['pdf', /\.pdf$/i],
  ['markdown', /\.(md|markdown)$/i],
  ['deck', /\.pptx$/i],
];
/** What the view can open, or null. */
export const reviewKind = (path: string | null | undefined): ReviewKind | null => KINDS.find(([, re]) => re.test(String(path ?? '').split(/[?#]/)[0]))?.[0] ?? null;

// Only what plainly means "another go at this file". A bare number does not:
// shot-3.png and shot-4.png are two shots.
const VERSION_TAIL = /(?:[-_ ]v\d+|\s*\(\d+\)|-\d+-|[-_ ](?:final|latest))$/i;

function baseStem(name: string): string {
  const dot = name.lastIndexOf('.');
  let stem = dot > 0 ? name.slice(0, dot) : name;
  while (VERSION_TAIL.test(stem) && stem.replace(VERSION_TAIL, '')) stem = stem.replace(VERSION_TAIL, '');
  return stem;
}
const stemOf = (name: string): string => baseStem(name).toLowerCase();

/** 3 for `rows-v3.csv`, 1 for a name with no tail, null for any other tail (final, (2)). */
export function numberInName(name: string): number | null {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const v = stem.match(/[-_ ]v(\d+)$/i);
  if (v) return Number(v[1]);
  return VERSION_TAIL.test(stem) ? null : 1;
}

/** `group-seat-picker-v3.png` as `group-seat-picker.png`. */
export function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return `${baseStem(name)}${dot > 0 ? name.slice(dot) : ''}`;
}

// A page or a script is keyed by its stem and extension, as it was keyed by its
// whole name before versions of one folded, so where it was filed still holds.
function keyOf(name: string, path: string): string {
  const stem = stemOf(name);
  const kind = reviewKind(path);
  if (kind) return `${stem}\0${kind}`;
  return `${stem}\0${baseName(name)}`;
}

/** The key of the family a path belongs to, in plain characters (a database refuses \0). */
export const familyKeyOf = (path: string): string => keyOf(shownName(path), path).replace(/\0/g, '/');

const endsWithPath = (whole: string, part: string): boolean => whole === part || whole.endsWith(`/${part}`);

/**
 * The files of a thread, grouped into families of versions, oldest version first
 * in the order they were first said. Each version has `id`, the name a mark uses
 * for it, `name`, `path`, `n` and `by`. The same name attached twice is two files
 * and two versions, since an attachment's saved name is new each time.
 *
 * `numbers` maps a path to its number on the file's version line
 * (shared/version-line.mts). A family the line knows is numbered by it, in its
 * order, and a path the line does not know is no version of that family,
 * except `keep`: the paths a person pressed or saw drawn, which Files may not have numbered yet.
 */
export function threadFiles(files: readonly ThreadFile[] | null | undefined, numbers: Readonly<Record<string, number>> | null = null, { keep = null }: { keep?: string | readonly string[] | null } = {}): FileFamily[] {
  const kept = (typeof keep === 'string' ? [keep] : keep ?? []).map(cleanAsked).filter(Boolean);
  const families = new Map<string, { key: string; versions: Array<FileVersion & { line?: number }> }>();
  const seenPaths = new Set<string>();
  for (const f of files ?? []) {
    const path = String(f.path ?? '').replace(/^\.\//, '');
    if (!path || seenPaths.has(path)) continue;
    seenPaths.add(path);
    const name = shownName(path);
    const key = keyOf(name, path);
    let family = families.get(key);
    if (!family) { family = { key, versions: [] }; families.set(key, family); }
    const line = Number.isInteger(numbers?.[path]) ? numbers![path] : undefined;
    const same = family.versions.filter((v) => v.name === name);
    // Another path is the same file only when one ends with the other: a bare
    // name or a relative path inside a whole one. Two folders are two files.
    const written = same.filter((v) => [v.path, ...(v.also ?? [])].some((p) => endsWithPath(p, path) || endsWithPath(path, p))).at(-1);
    if (written && !SENT_COPY.test(path) && (line === undefined || written.line === undefined || written.line === line)) {
      (written.also ??= []).push(path);
      written.line ??= line;
      continue;
    }
    const id = f.newer && line !== undefined ? `${baseName(name)}@${line}` : same.length ? `${name}#${same.length + 1}` : name;
    family.versions.push({ id, name, path, n: family.versions.length + 1, by: f.by ?? null, at: f.at ?? 0, ...(line !== undefined ? { line } : {}), ...(typeof f.agent === 'string' ? { agent: f.agent } : {}), ...(f.edited ? { edited: true } : {}), ...(f.newer ? { newer: true } : {}), ...(f.made ? { made: true } : {}) });
  }
  const out = [...families.values()];
  for (const family of out) {
    if (!family.versions.some((v) => v.line !== undefined)) {
      // A handoff names the newest first; names that number themselves, each once, say the order.
      const nums = family.versions.map((v) => numberInName(v.name));
      if (family.versions.length > 1 && nums.every((n): n is number => n !== null) && new Set(nums).size === nums.length) {
        family.versions = family.versions.map((v, i) => ({ v, at: nums[i] as number })).sort((a, b) => a.at - b.at).map(({ v }, i) => ({ ...v, n: i + 1 }));
      }
      continue;
    }
    const byLine = new Map<number, FileVersion & { line?: number }>();
    const unknown: Array<FileVersion & { line?: number }> = [];
    for (const v of family.versions) {
      if (v.line === undefined) {
        if ([v.path, ...(v.also ?? [])].some((p) => kept.some((k) => endsWithPath(p, k) || endsWithPath(k, p)))) unknown.push(v);
        continue;
      }
      const was = byLine.get(v.line);
      if (was) (was.also ??= []).push(v.path, ...(v.also ?? []));
      else byLine.set(v.line, v);
    }
    const numbered = [...byLine.values()].sort((a, b) => a.line! - b.line!).map(({ line, ...v }) => ({ ...v, n: line! }));
    const top = numbered.at(-1)?.n ?? 0;
    family.versions = [...numbered, ...unknown.map((v, i) => ({ ...v, n: top + i + 1 }))];
  }
  return out;
}

function cleanAsked(raw: string | null | undefined): string {
  let p = String(raw ?? '').replace(/^file:\/\//, '').split(/[?#]/)[0];
  try { p = decodeURIComponent(p); } catch { /* left as written */ }
  return p.replace(/^\.\//, '');
}

/**
 * The version a card's path names, or null. Never another file: a path that
 * names nothing on the thread is not answered with whatever came last.
 */
/**
 * A thread's files as their lines number them (main/files-place.mts lineFor):
 * the number of each path the thread said, and a line for each version made
 * elsewhere, so threadFiles counts every version the line holds.
 */
export function lineAsThread(line: readonly FileLine[] | null | undefined): { numbers: Record<string, number>; lines: ThreadLine[] } {
  const numbers: Record<string, number> = {};
  const lines: ThreadLine[] = [];
  for (const file of line ?? []) {
    for (const v of file.versions ?? []) {
      for (const p of v.here ?? []) numbers[p] = v.n;
      if (v.here?.length) continue;
      // Only a teammate has it: a path that finds nothing here, so it says whose it is.
      const path = v.path ?? `line/${v.n}/${v.name}`;
      numbers[path] = v.n;
      lines.push({
        id: `line:${file.key}:${v.n}`, ts: v.at, ...(v.by ? { by: v.by } : {}), source: typeof v.agent === 'string' ? 'agent' : 'system',
        patch: { note: `[${v.name}](${path})`, newer: true, ...(v.agent ? { voice: { name: v.agent } } : {}) },
      });
    }
  }
  return { numbers, lines };
}

/**
 * Where a press opens: the version a note or mark names (`file`), else the one
 * a card's path names, else with neither the newest. Never another file.
 */
export function whereAPressLands(families: readonly FileFamily[] | null | undefined, { path, file }: { path?: string | null; file?: string | null } = {}): FileStep | null {
  const flat = (families ?? []).flatMap((f, fi) => f.versions.map((v, vi) => ({ fi, vi, v })));
  const at = (x: FileStep | null | undefined): FileStep | null => (x ? { fi: x.fi, vi: x.vi } : null);
  if (file) {
    const hit = flat.find((x) => x.v.id === file);
    if (hit || !path) return at(hit);
  }
  if (path) {
    const v = versionForPath(families, path);
    return at(v ? flat.find((x) => x.v === v) : null);
  }
  return at(flat.at(-1));
}

/**
 * The version a mark's `file` names on this computer: its id here, else
 * `name@n`, the n-th on the file's version line as Files names it, else a name
 * a teammate's copy gave it before (`name#k` for the k-th of those). Null when
 * it names none, never the nearest file.
 */
export function versionNamed(families: readonly FileFamily[] | null | undefined, file: string | null | undefined): FileVersion | null {
  if (!file) return null;
  const all = (families ?? []).flatMap((f) => f.versions);
  const exact = all.find((v) => v.id === file);
  if (exact) return exact;
  const [, base, mark, num] = /^(.*?)(?:([#@])(\d+))?$/.exec(file)!;
  const n = num ? Number(num) : 1;
  if (mark === '@') return (families ?? []).find((f) => f.key === familyOfName(base))?.versions.find((v) => v.n === n) ?? null;
  return all.filter((v) => v.name !== base && nameBefore(v.name) === base)[n - 1] ?? null;
}

/** `marks` with each note and approval on the id its version has here, so both people's views put it on one file. */
export function marksOnVersions<N extends { file: string }, A extends { file: string }, M extends { notes: N[]; approvals: A[] }>(marks: M, families: readonly FileFamily[] | null | undefined): M {
  const ids = new Set((families ?? []).flatMap((f) => f.versions.map((v) => v.id)));
  const onIt = <T extends { file: string }>(m: T): T => {
    if (ids.has(m.file)) return m;
    const v = versionNamed(families, m.file);
    return v ? { ...m, file: v.id } : m;
  };
  const notes = marks.notes.map(onIt);
  const approvals = marks.approvals.map(onIt);
  return notes.every((n, i) => n === marks.notes[i]) && approvals.every((a, i) => a === marks.approvals[i]) ? marks : { ...marks, notes, approvals };
}

/**
 * Where the version in hand (`held`: its id and path) sits in `families` now,
 * or null when it is gone. With nothing held, `at` if that still names a
 * version, else null. `at` alone goes stale
 * when the list fills in and reorders or folds copies into one version.
 */
export function stillInHand(families: readonly FileFamily[] | null | undefined, at: FileStep | null, held: { id: string; path: string } | null): FileStep | null {
  const fits = (p: FileStep | null): p is FileStep => !!p && !!families?.[p.fi]?.versions[p.vi];
  if (held && fits(at) && families![at.fi].versions[at.vi].id === held.id) return at;
  if (held) {
    const flat = (families ?? []).flatMap((f, fi) => f.versions.map((v, vi) => ({ fi, vi, v })));
    const v = flat.find((x) => x.v.id === held.id)?.v ?? versionForPath(families, held.path);
    const hit = v && flat.find((x) => x.v === v);
    return hit ? { fi: hit.fi, vi: hit.vi } : null;
  }
  return fits(at) ? at : null;
}

/**
 * What the arrows step through: one step per file `paths` name, in their order,
 * at the newest version they name. Versions are the header's to step, never the arrows'.
 */
export function stepsThrough(families: readonly FileFamily[], paths: readonly string[] | null | undefined): FileStep[] {
  const out: FileStep[] = [];
  for (const p of paths ?? []) {
    const v = versionForPath(families, p);
    if (!v) continue;
    const fi = families.findIndex((f) => f.versions.includes(v));
    const vi = families[fi].versions.indexOf(v);
    const had = out.find((s) => s.fi === fi);
    if (!had) out.push({ fi, vi });
    else had.vi = Math.max(had.vi, vi);
  }
  return out;
}

/** The pictures the agent drew since you last spoke, or in its last answer that drew any. */
export function latestPicturesSaid(lines: readonly (ThreadLine | null | undefined)[] | null | undefined): string[] {
  const pictures = (turn: readonly ThreadLine[]): string[] => filesInLines(turn).filter((f) => reviewKind(f.path) === 'image').map((f) => f.path);
  let turn: ThreadLine[] = [];
  for (const l of [...(lines ?? [])].reverse()) {
    if (l?.source === 'founder') {
      if (pictures(turn).length) break;
      turn = [];
    } else if (l?.source === 'agent') turn.unshift(l);
  }
  return pictures(turn);
}

/**
 * Where an arrow press from `at` goes, or null at an end. With steps, the next
 * file in them, whichever version of this one is open. Without, the next file
 * at its newest version.
 */
export function nextStep(families: readonly FileFamily[] | null | undefined, steps: readonly FileStep[] | null | undefined, at: FileStep | null, by: number): FileStep | null {
  if (!at) return null;
  if (steps?.length) {
    const i = steps.findIndex((s) => s.fi === at.fi);
    return i < 0 ? null : steps[i + by] ?? null;
  }
  const fi = at.fi + by;
  return families?.[fi] ? { fi, vi: families[fi].versions.length - 1 } : null;
}

export function versionForPath(families: readonly FileFamily[] | null | undefined, raw: string | null | undefined): FileVersion | null {
  const asked = cleanAsked(raw);
  if (!asked) return null;
  const all = (families ?? []).flatMap((f) => f.versions);
  const pathsOf = (v: FileVersion): string[] => [v.path, ...(v.also ?? [])];
  const exact = all.find((v) => pathsOf(v).includes(asked));
  if (exact) return exact;
  const tail = all.filter((v) => pathsOf(v).some((p) => p.endsWith(`/${asked}`) || asked.endsWith(`/${p}`)));
  if (new Set(tail).size === 1) return tail[0];
  const named = all.filter((v) => v.name === shownName(asked));
  return named.length === 1 ? named[0] : null;
}

const EXT = 'png|jpe?g|gif|webp|svg|mp4|mov|m4v|webm|pdf|md|markdown|pptx';
const PATHISH = String.raw`(?:\.?\/)?[\w.-]+(?:\/[\w.-]+)*\.(?:${EXT})`;
const NAMED = new RegExp(
  String.raw`\]\(<?((?:\.?\/)?[^()\s>:]+\.(?:${EXT}))>?\)`
  + '|`(' + PATHISH + ')`'
  + String.raw`|(?<![\w./:@~(\[-])(${PATHISH})(?![\w/-])`,
  'gi',
);
// Every alternative of NAMED needs one of these, and NAMED is slow to fail on long text.
const ANY_EXT = new RegExp(String.raw`\.(?:${EXT})`, 'i');
/** Counts for tests: how many messages NAMED was run over. */
export const filesInLinesInternals = { searched: 0 };
const FENCE = /```[\s\S]*?(?:```|$)/g;
const EDITED_WORDS = /^Updated [^\n]+\.\s*\n\n\[/;

/** The message that carries an edit to people who only see messages: a group, or a shared thread's readers. */
export const editedWords = (name: string, path: string): string => `Updated ${name}.\n\n[${name}](${path})`;

// Files the big view does not review but Files still lists: a page an agent made,
// a script. Unlike reviewable kinds, a bare word in a sentence ("node.js") is no
// claim, so only a link or a code span counts, and Files keeps those really on disk.
const OTHER_KINDS: ReadonlyArray<readonly [OtherKind, RegExp]> = [['page', /\.html?$/i], ['table', /\.(csv|tsv)$/i], ['code', /\.(py|ipynb|js|mjs|cjs|ts|mts|cts|tsx|jsx|rb|go|rs|sh|sql|css|txt|json|ya?ml|xml)$/i]];
export const otherKind = (path: string | null | undefined): OtherKind | null => OTHER_KINDS.find(([, re]) => re.test(String(path ?? '').split(/[?#]/)[0]))?.[0] ?? null;
/** Which page the big view draws for a file, or null. */
export const viewKind = (path: string | null | undefined): ViewKind | null => reviewKind(path) ?? otherKind(path);
/** Whether a file pressed in a group opens in the big view: what it reviews, and a table. */
export const opensBigInAGroup = (name: string | null | undefined): boolean => !!reviewKind(name) || otherKind(name) === 'table';
// The brief has an agent name a page or table it made by its bare path, so one
// with a folder in it counts too. A script named bare is a sentence about code.
// Read back from each ending: tried at every letter, it is slow on long messages.
const BARE_END = /\/[\w.-]+\.(?:html?|csv|tsv)(?![\w/-])/gi;
const MAY_BE_BARE = new RegExp(BARE_END.source, 'i');
const BARE_OTHER = /(?<![\w./:@~(\[-])((?:\.?\/)?[\w.-]+(?:\/[\w.-]+)+\.(?:html?|csv|tsv))$/i;
// Alone on its line, a name is a claim even with no folder or for a script; inside a sentence it is not.
const ALONE = /^[ \t]*((?:\.?\/)?[\w-][\w.-]*(?:\/[\w.-]+)*\.[A-Za-z0-9]+)[ \t]*$/gm;
function bareOthers(text: string): Array<{ at: number; path: string }> {
  const out: Array<{ at: number; path: string }> = [...text.matchAll(ALONE)].map((m) => ({ at: m.index + m[0].indexOf(m[1]), path: m[1] }));
  for (const m of text.matchAll(BARE_END)) {
    const end = m.index + m[0].length;
    let start = m.index;
    const floor = Math.max(0, m.index - 400);
    while (start > floor && /[\w./:@~(\[-]/.test(text[start - 1])) start -= 1;
    const word = text.slice(Math.max(0, start - 1), end).match(BARE_OTHER);
    if (word) out.push({ at: start, path: word[1] });
  }
  return out;
}
const OTHER_NAMED =/\]\(<?((?:\.?\/)?[^()\s>:]+\.[A-Za-z0-9]+)>?\)|`((?:\.?\/)?[\w.-]+(?:\/[\w.-]+)*\.[A-Za-z0-9]+)`/g;

// "-390.png" is the end of a name said before it, not a file.
const shorthand = (path: string): boolean => /^[-_]/.test(path.split('/').pop() ?? '');

/** What filesInLines leaves out, in the same shape. A person's own words only count what they attached, a link. */
export function otherFilesInLines(lines: readonly ThreadLine[] | null | undefined): NamedFile[] {
  const out: NamedFile[] = [];
  const seen = new Set<string>();
  for (const l of lines ?? []) {
    const p = l?.patch;
    if (!p) continue;
    for (const field of ['result', 'note', 'body', 'answer']) {
      if (typeof p[field] !== 'string') continue;
      const named = p[field].includes('](') || p[field].includes('`');
      const bare = l.source !== 'founder' && (MAY_BE_BARE.test(p[field]) || new RegExp(ALONE.source, 'im').test(p[field]));
      if (!named && !bare) continue;
      const text = p[field].replace(FENCE, '');
      const hits = [
        ...(named ? [...text.matchAll(OTHER_NAMED)].filter((m) => l.source !== 'founder' || m[1]).map((m) => ({ at: m.index, path: m[1] ?? m[2] })) : []),
        ...(bare ? bareOthers(text) : []),
      ].sort((a, b) => a.at - b.at);
      for (const hit of hits) {
        const path = hit.path.replace(/^\.\//, '');
        if (!otherKind(path) || reviewKind(path) || seen.has(path) || shorthand(path)) continue;
        seen.add(path);
        const agent = p.voice?.name ?? (l.source === 'agent' ? '' : null);
        out.push({ path, by: l.by ?? null, at: l.ts, ...(agent !== null ? { agent } : {}) });
      }
    }
  }
  return out;
}

/** The family a file of this name joins, as threadFiles keys it. */
export function familyOfName(file: string | null | undefined): string {
  const name = shownName(String(file ?? '').replace(/^\.\//, ''));
  return keyOf(name, name);
}

/** The reviewable paths one line's words name, repeats included. */
function* pathsSaidOn(l: ThreadLine | null | undefined): Generator<{ path: string; edited: boolean }> {
  if (!l?.patch) return;
  const p = l.patch;
  for (const field of ['body', 'answer', 'result', 'note']) {
    if (typeof p[field] !== 'string' || !ANY_EXT.test(p[field])) continue;
    filesInLinesInternals.searched += 1;
    // A person's own words only count a file they attached. The notes sent to an
    // agent name the file it should make, which does not exist yet.
    const linksOnly = l.source === 'founder' && (field === 'answer' || field === 'body');
    const edited = linksOnly && EDITED_WORDS.test(p[field]);
    for (const m of p[field].replace(FENCE, '').matchAll(NAMED)) {
      if (linksOnly && !m[1]) continue;
      const path = (m[1] ?? m[2] ?? m[3]).replace(/^\.\//, '');
      if (!shorthand(path)) yield { path, edited };
    }
  }
}

/** `said` with each path a person pressed or saw drawn that it does not hold yet, when the big view can show it. */
export function withFilesAsked(said: readonly NamedFile[], asked: readonly (string | null | undefined)[]): NamedFile[] {
  const out = [...said];
  for (const raw of asked) {
    const path = raw?.replace(/^\.\//, '');
    if (path && viewKind(path) && !versionForPath(threadFiles(out), path)) out.push({ path, by: null, at: 0 });
  }
  return out;
}

/** Every reviewable file a thread's lines name, in the order they name them. */
export function filesInLines(lines: readonly ThreadLine[] | null | undefined): NamedFile[] {
  const out: NamedFile[] = [];
  const seen = new Set<string>();
  for (const l of lines ?? []) {
    const p = l?.patch;
    if (!p) continue;
    if (p.artifact?.do === 'edit' && p.artifact.path && !seen.has(p.artifact.path)) {
      seen.add(p.artifact.path);
      out.push({ path: p.artifact.path, by: l.by ?? null, at: l.ts, edited: true });
    }
    for (const { path, edited } of pathsSaidOn(l)) {
      if (seen.has(path)) continue;
      seen.add(path);
      const agent = p.voice?.name ?? (l.source === 'agent' ? '' : null);
      out.push({ path, by: l.by ?? null, at: l.ts, ...(agent !== null ? { agent } : {}), ...(edited ? { edited: true } : {}), ...(p.newer === true ? { newer: true } : {}), ...(p.made === true ? { made: true } : {}) });
    }
  }
  return out;
}

/**
 * The ids of a family's versions that the newest message naming any of them
 * names. An agent that offers sky.png and sky-v5.png side by side is offering
 * two choices, and neither is the other's older copy.
 */
export function offeredTogether(lines: readonly (ThreadLine | null | undefined)[] | null | undefined, family: Pick<FileFamily, 'versions'> | null | undefined): Set<string> {
  const versions = family?.versions ?? [];
  const list = lines ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const ids = new Set<string>();
    for (const { path } of pathsSaidOn(list[i])) {
      const v = versions.find((x) => [x.path, ...(x.also ?? [])].some((p) => endsWithPath(p, path) || endsWithPath(path, p)));
      if (v) ids.add(v.id);
    }
    if (ids.size) return ids;
  }
  return new Set<string>();
}

/** "Shared by …" for a version: the agent and who it works for when an agent shared it. */
export function sharedByWords(v: Pick<FileVersion, 'by' | 'agent' | 'edited' | 'made'> | null | undefined, { me, nameOf }: { me: string | null; nameOf: (id: string) => string }): string {
  const whose = !v?.by || v.by === me ? null : nameOf(v.by);
  if (v?.edited) return `Edited by ${whose ?? 'you'}`;
  if (v?.made) return `Made by ${whose ?? 'you'}`;
  if (typeof v?.agent !== 'string') return `Shared by ${whose ?? 'you'}`;
  // A thread that is no AI teammate's speaks as plain "Agent", which names nobody.
  if (v.agent && v.agent !== PLAIN_AGENT) return `Shared by ${v.agent} for ${whose ?? 'you'}`;
  return whose ? `Shared by ${whose}'s agent` : 'Shared by your agent';
}

/** "Resolved by your agent in v15": a comment the version `v` answered. */
export function resolvedInWords(v: Pick<FileVersion, 'by' | 'agent' | 'n'>, { me, nameOf }: { me: string | null; nameOf: (id: string) => string }): string {
  const whose = !v?.by || v.by === me ? null : nameOf(v.by);
  let who: string;
  if (typeof v?.agent !== 'string') who = whose ?? 'you';
  else if (v.agent && v.agent !== PLAIN_AGENT) who = v.agent;
  else who = whose ? `${whose}'s agent` : 'your agent';
  return `Resolved by ${who} in v${v.n}`;
}

/**
 * The open comments on the versions before this one, as this version shows them:
 * the same comment, not a copy, so resolving it here resolves it everywhere.
 * `from` names the version it was made on ("v1").
 */
export function carriedNotes<N extends Pick<FileNote, 'file' | 'resolved'>>(family: Pick<FileFamily, 'versions'> | null | undefined, index: number, notes: readonly N[] | null | undefined, { resolved = false }: { resolved?: boolean } = {}): Array<N & { from: string }> {
  const earlier = new Map((family?.versions ?? []).slice(0, Math.max(0, index)).map((v) => [v.id, v]));
  return (notes ?? []).filter((n) => earlier.has(n.file) && (resolved || !n.resolved)).map((n) => ({ ...n, from: `v${earlier.get(n.file)!.n}` }));
}

/** What to tell someone editing version `baseN` when somebody else has saved since, or null. */
export function editClash(family: Pick<FileFamily, 'versions'> | null | undefined, baseN: number, me: string | null, nameOf: NameOf): string | null {
  const versions = family?.versions ?? [];
  const other = versions.slice(baseN).filter((v) => v.by !== me).at(-1);
  if (!other) return null;
  return `${nameOf(other.by)} saved v${versions.indexOf(other) + 1} while you were editing. Yours saves as v${versions.length + 1}, with their changes merged in.`;
}

/** What a person calls a file at any version: one name, whatever each version is named on disk. */
export function familyName(family: { versions: ReadonlyArray<Pick<FileVersion, 'name'>> } | null | undefined, version?: Pick<FileVersion, 'name'> | null): string {
  const all = family?.versions ?? [];
  if (all.length > 1) return baseName(all[0].name);
  return all[0]?.name ?? version?.name ?? '';
}

/** What to say on a version whose words changed after an earlier one was approved, or null. */
export function approvalSince(family: Pick<FileFamily, 'versions'> | null | undefined, index: number, approvals: ReadonlyArray<Pick<FileApproval, 'file' | 'by'>> | null | undefined, nameOf: NameOf): string | null {
  const versions = family?.versions ?? [];
  const here = versions[index];
  if (!here || (approvals ?? []).some((a) => a.file === here.id)) return null;
  const old = versions.slice(0, index).reverse().find((v) => (approvals ?? []).some((a) => a.file === v.id));
  if (!old) return null;
  const given = approvals!.filter((a) => a.file === old.id).at(-1)!;
  return `${nameOf(given.by)} approved v${old.n}. ${nameOf(here.by)} changed it since, so this version is not approved.`;
}

/**
 * What to ask before approving version `index`, or null: a newer version, or
 * comments still open on it. A version in `offered` (offeredTogether) is a
 * choice still on the table, so a newer one beside it is not asked about.
 */
export function approveAsk(family: Pick<FileFamily, 'versions'> | null | undefined, index: number, notes: ReadonlyArray<Pick<FileNote, 'file' | 'resolved'>> | null | undefined, offered: ReadonlySet<string> | null = null): { text: string; newest: FileVersion | null } | null {
  const versions = family?.versions ?? [];
  const here = versions[index];
  if (!here) return null;
  const newest = index < versions.length - 1 && !offered?.has(here.id) ? versions.at(-1)! : null;
  const open = (notes ?? []).filter((n) => n.file === here.id && !n.resolved).length + carriedNotes(family, index, notes).length;
  if (!newest && !open) return null;
  const said = [`Approve v${here.n}?`];
  if (newest) said.push(`v${newest.n} is newer.`);
  if (open) said.push(open > 1 ? `${open} comments are still open.` : '1 comment is still open.');
  return { text: said.join(' '), newest };
}

/** The newest edited copy of the file at `path`, or `path` when nobody has edited it. */
export function newestOfFamily(path: string, edits: ReadonlyArray<{ path: string }> | null | undefined): string {
  if (!edits?.length) return path;
  const family = threadFiles([{ path }, ...edits.map((e) => ({ path: e.path }))]).find((f) => f.versions.some((v) => v.path === String(path).replace(/^\.\//, '')));
  return family?.versions.at(-1)?.path ?? path;
}

/** The line that tells an agent which files people have edited, or null. Its own later version ends it. */
export function editedFilesLine(lines: readonly ThreadLine[] | null | undefined): string | null {
  const families = threadFiles(filesInLines(lines));
  const moved = families.filter((f) => f.versions.at(-1)?.edited && f.versions.length > 1);
  const missedOn = new Map((lines ?? []).flatMap((l): Array<[string, string]> => (l?.patch?.artifact?.do === 'reconcile' && l.patch.artifact.missed ? [[l.patch.artifact.file, l.patch.artifact.missed]] : [])));
  const missed = families.flatMap((f) => {
    // threadFiles never makes a family without a version.
    const newest = f.versions.at(-1)!;
    return missedOn.has(newest?.id) ? [`${newest.path} was written without the edit in ${missedOn.get(newest.id)}`] : [];
  });
  const clashed = new Map((lines ?? []).flatMap((l): Array<[string, string]> => (l?.patch?.artifact?.do === 'reconcile' && l.patch.artifact.clash && l.patch.artifact.path ? [[l.patch.artifact.path, l.patch.artifact.file]] : [])));
  const kept = moved.flatMap((f) => (clashed.has(f.versions.at(-1)!.path) ? [`${f.versions.at(-1)!.path} kept a person's words where your ${clashed.get(f.versions.at(-1)!.path)} changed the same ones`] : []));
  const said: string[] = [];
  if (moved.length) said.push(`People edited files on this thread. Read the newest version, not the copy you remember: ${moved.map((f) => `${f.versions[0].name} is now ${f.versions.at(-1)!.path}`).join('; ')}. An edit your next version leaves out is merged back in, so to undo one because they asked, pass replacesEdits to write_document.`);
  if (kept.length) said.push(`${kept.join('; ')}.`);
  if (missed.length) said.push(`${missed.join('; ')}. Read that edit and carry it across unless you were told otherwise.`);
  return said.join(' ') || null;
}

/** Who said the file first, which is who an approval or a note reaches in a conversation. */
export function whoseIsTheFile(files: readonly ThreadFile[] | null | undefined, id: string): string | null {
  const hit = threadFiles(files).flatMap((f) => f.versions).find((v) => v.id === id);
  return hit?.by ?? null;
}

/* ---------------------------- who it waits on ---------------------------- */

/** Words written to you ("Maya, ...", "@Maya") or a question that names you. */
export function asksByName(text: string | null | undefined, name: string | null | undefined): boolean {
  const first = firstWord(name);
  if (first.length < 2) return false;
  if (addressedTo(text, [{ id: 'you', name: first }])) return true;
  return String(text ?? '').includes('?') && new RegExp(`(?<![\\w@])${escaped(first)}(?![\\w'’])`, 'i').test(String(text ?? ''));
}

/**
 * What on this row is waiting on this person: notes on their file, notes naming
 * them and approvals of their file, from someone else, not yet seen or settled.
 */
export function fileNewsFor(item: FileNewsRow | null | undefined, me: string | null | undefined, { myName = null }: { myName?: string | null } = {}): FileNews[] {
  const marks = item?.artifacts;
  if (!marks || !me) return [];
  const seen = new Set(marks.seen?.[me] ?? []);
  const ownerOfRow = item!.runner ?? item!.createdBy ?? null;
  const asksMe = (text: string): boolean => asksByName(text, myName);
  const news: FileNews[] = [];
  for (const n of marks.notes ?? []) {
    if (n.by === me || n.resolved || seen.has(n.id)) continue;
    const named = (n.mentions ?? []).includes(me) || asksMe(n.text);
    if (named || (n.owner ?? ownerOfRow) === me) news.push({ kind: named ? 'named' : 'note', id: n.id, by: n.by, ts: n.ts, file: n.file, text: n.text });
  }
  // A reply waits on whoever already spoke on that comment, and on whoever it asks by name.
  for (const n of marks.notes ?? []) {
    if (n.resolved || !n.replies?.length) continue;
    const spoke = new Set([n.by]);
    for (const r of n.replies) {
      if (r.by !== me && !seen.has(r.id) && (spoke.has(me) || asksMe(r.text))) news.push({ kind: spoke.has(me) ? 'reply' : 'named', id: r.id, on: n.id, by: r.by, ts: r.ts, file: n.file, text: r.text });
      spoke.add(r.by);
    }
  }
  // An approval is a decision everyone on the conversation acts on, not only the owner.
  const onIt = (item!.people ?? []).includes(me);
  for (const a of marks.approvals ?? []) {
    const id = approvalId(a);
    if (a.by === me || seen.has(id) || ((a.owner ?? ownerOfRow) !== me && !onIt)) continue;
    news.push({ kind: 'approved', id, by: a.by, ts: a.ts, file: a.file });
  }
  // Your own Done settles what came before it, or the closed thread stays in Needs you.
  const close = item!.status === 'done' && item!.wrote?.status?.by === me ? item!.wrote.status.ts : 0;
  return news.filter((n) => n.ts > close).sort((x, y) => x.ts - y.ts);
}

const visibleName = (id: string | null | undefined): string => String(id ?? '').replace(/#\d+$/, '');

/** A row's line for what waits: "Maya approved onboarding-a.png". */
export function fileNewsLine(news: readonly FileNews[] | null | undefined, nameOf: NameOf): string | null {
  const last = news?.[news.length - 1];
  if (!last) return null;
  const who = nameOf(last.by);
  const file = visibleName(last.file);
  if (last.kind === 'approved') return `${who} approved ${file}`;
  if (last.kind === 'named') return `${who} named you on ${file}: ${last.text}`;
  if (last.kind === 'reply') return `${who} replied on ${file}: ${last.text}`;
  return `${who} commented on ${file}: ${last.text}`;
}

/* --------------------------------- agents -------------------------------- */

/** `onboarding-a.png` as v2: what an agent saves its next go as, so it lands as the next version. */
export function nextVersionName(name: string, count: number): string {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  let stem = dot > 0 ? name.slice(0, dot) : name;
  // A thread that only holds v7 still asks for v8, not v2.
  const named = Number(/[-_ ]v(\d+)$/i.exec(stem)?.[1] ?? 0);
  while (VERSION_TAIL.test(stem) && stem.replace(VERSION_TAIL, '')) stem = stem.replace(VERSION_TAIL, '');
  return `${stem}-v${Math.max(count, named) + 1}${ext}`;
}

const spotWords = (n: Pick<FileNote, 'place' | 'pin'>): string => (unit(n.place.x)
  ? `${placeWords(n)}, ${Math.round(n.place.x * 100)}% across and ${Math.round(n.place.y! * 100)}% down`
  : placeWords(n));
const saveAsNext = (version: Pick<FileVersion, 'name'>, count: number): string => `save the result as ${nextVersionName(version.name, count)} beside the original, keeping the original as it is. Name the new file in your reply so it opens as the next version of ${baseName(version.name)}. The app gives every version its number, the same for everyone, so call it the next version, not a number of your own.`;

/** The open notes on this version not yet sent to the agent, as the words that send them. */
export function notesForTheAgent(marks: Pick<FileMarks, 'notes'> | null | undefined, version: Pick<FileVersion, 'id' | 'path' | 'name'>, count: number, { nameOf = () => 'Someone' }: { nameOf?: NameOf } = {}): { text: string; ids: string[] } {
  const open = (marks?.notes ?? []).filter((n) => n.file === version.id && !n.resolved && !n.sent);
  const text = [
    `Notes on ${version.path}:`,
    ...open.map((n) => [`- ${spotWords(n)}: ${n.text} (${nameOf(n.by)})`, ...(n.replies ?? []).map((r) => `  - ${r.text} (${nameOf(r.by)})`)].join('\n')),
    '',
    `Make these changes and ${saveAsNext(version, count)}`,
  ].join('\n');
  return { text, ids: open.map((n) => n.id) };
}

/** Replies written for the agent under a comment it already has, which Send or @agent hands over next. */
export const unsentReplies = (note: FileNote | null | undefined, people: readonly NotePerson[] = []): FileReply[] => (note?.sent && !note.resolved
  ? (note.replies ?? []).filter((r) => !r.sent && noteGoesTo({ text: r.text }, people).to === 'agent')
  : []);

/** Replies on a note the agent was already sent, as the words that send them. */
export function repliesForTheAgent(note: Pick<FileNote, 'place' | 'pin' | 'text'>, replies: readonly FileReply[], version: Pick<FileVersion, 'path' | 'name'>, count: number, { nameOf = () => 'Someone' }: { nameOf?: NameOf } = {}): string {
  return [
    `${replies.length === 1 ? 'A reply' : 'Replies'} on the note at ${spotWords(note)} on ${version.path}, "${note.text}":`,
    ...replies.map((r) => `- ${r.text} (${nameOf(r.by)})`),
    '',
    `If this asks for changes, make them and ${saveAsNext(version, count)}`,
  ].join('\n');
}

/** A comment that tags your own agent with @agent, which sends it now rather than waiting for Send. */
export const tagsYourAgent = (text: string | null | undefined): boolean => /(?:^|[\s(])@agent(?![\w'’@.-]?\w)/i.test(String(text ?? ''));

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstWord = (name: string | null | undefined): string => String(name ?? '').trim().split(/\s+/)[0] ?? '';

/** The teammate a note opens on ("Sofia, ...", "Hey Sofia:") or names with @, by id, or null. */
export function addressedTo(text: string | null | undefined, people: readonly NotePerson[] | null | undefined): string | null {
  const words = String(text ?? '').trim();
  for (const p of people ?? []) {
    const name = firstWord(p?.name);
    if (!p?.id || name.length < 2) continue;
    const n = escaped(name);
    if (new RegExp(`^(?:(?:hi|hey|hello|dear)\\s+)?@?${n}\\s*[,:\\u2014\\u2013-]`, 'i').test(words)) return p.id;
    if (new RegExp(`(?:^|[\\s(])@${n}(?![\\w'’])`, 'i').test(words)) return p.id;
  }
  return null;
}

// A NOTE THAT ONLY THANKS OR APPROVES is praise in every clause: "Thanks, v6
// reads well." Read clause by clause rather than by its first word, so a
// thank-you that goes on to say anything else is work for the agent.
const PRAISE = /^(?:(?:v\d+|it|this|that|all|so|very|really|is|['’]s)\s+)*(?:thanks|thank you|thx|ty|cheers|approved?|lgtm|looks? (?:good|great|right|fine|perfect)|reads? (?:well|great|fine|right|nicely)|sounds? (?:good|great)|love (?:it|this|that)|perfect|great|nice|nice work|well done|good|good (?:work|job)|all good|ship it|works|this is it|that['’]?s it)(?:\s+(?:to me|for me|v\d+|you|it|this|all|so much|a lot|again|now|here|work))*$/i;
// En and em dash, built from their codes so no dash sits in the source the no-dash check reads.
const DASHES = String.fromCharCode(0x2013, 0x2014);
const CLAUSES = new RegExp(String.raw`[,.;:!…${DASHES}]+|\s+-\s+|\s+(?:and|&)\s+`);
export function onlyThanks(text: string | null | undefined): boolean {
  const words = String(text ?? '').replace(new RegExp(String.raw`[^\p{L}\p{N}\s,.;:!?…${DASHES}&'’-]`, 'gu'), ' ').trim();
  if (!words || words.includes('?')) return false;
  const clauses = words.split(CLAUSES).map((c) => c.trim().replace(/\s+/g, ' ')).filter(Boolean);
  return clauses.length > 0 && clauses.every((c) => PRAISE.test(c));
}

/**
 * Who a note on an agent's file is for: the agent, a teammate it is written
 * to, or nobody (a thank-you or an approval that asks for nothing). Only the
 * agent's notes start a run; "Send to the agent" (`toAgent`) overrules.
 */
export function noteGoesTo(note: { text?: string; mentions?: readonly string[]; toAgent?: boolean; by?: string | null } | null | undefined, people: readonly NotePerson[] = []): NoteTarget {
  if (note?.toAgent) return { to: 'agent' };
  // "Lena: add a switch", written by Lena, is signed, not addressed.
  const others = note?.by ? people.filter((p) => p.id !== note.by) : people;
  const named = (note?.mentions ?? []).find((m) => m !== note?.by) ?? addressedTo(note?.text, others);
  if (named) return { to: 'person', person: named };
  const text = String(note?.text ?? '').trim();
  // "Sam, approved" names nobody on the team, so it is read past the name, and
  // tried whole too, because "Thanks," reads like a name.
  if (onlyThanks(text) || onlyThanks(text.replace(/^@?[A-Z][\w'-]*\s*[,:]\s*/, ''))) return { to: 'nobody' };
  return { to: 'agent' };
}

/** Every file a thread names that a note can be on: pictures, films and documents, then pages and scripts. */
export const notedFilesInLines = (lines: readonly ThreadLine[] | null | undefined): NamedFile[] => [...filesInLines(lines), ...otherFilesInLines(lines)];

/** A note held for Send that nobody has sent yet. */
export const stillWaiting = (note: Pick<FileNote, 'wait' | 'toAgent' | 'sent'> | null | undefined): boolean => !!note?.wait && !note.toAgent && !note.sent;

/**
 * The open comments a later version of their file answered: one sent to the
 * agent, by the agent's next version; one written to a teammate, by that
 * teammate's next version. A reopen after that version keeps it open.
 * Returns `[{ on, in }]`, the comment and the version.
 */
export function answeredNotes(lines: readonly ThreadLine[] | null | undefined, { people = [] }: { people?: readonly NotePerson[] } = {}): Array<{ on: string; in: string }> {
  const entries: MarkEntry[] = [];
  const sentAt = new Map<string, number>();
  const settledAt = new Map<string, number>();
  for (const l of lines ?? []) {
    const a = l?.patch?.artifact;
    if (!a) continue;
    entries.push({ ...a, by: l.by ?? null, ts: l.ts });
    if (a.do === 'sent') for (const id of a.on ?? []) if (!sentAt.has(id)) sentAt.set(id, l.ts);
    if (a.do === 'resolve' || a.do === 'reopen') settledAt.set(a.on, Math.max(settledAt.get(a.on) ?? -Infinity, l.ts));
  }
  // Notes told to an agent name the file it should make, which is no version until it does.
  const families = threadFiles(notedFilesInLines((lines ?? []).filter((l) => !l?.patch?.fromNotes)));
  const out: Array<{ on: string; in: string }> = [];
  for (const n of marksOf(entries).notes) {
    if (n.resolved) continue;
    const family = families.find((f) => f.versions.some((v) => v.id === n.file));
    if (!family) continue;
    const later = family.versions.slice(family.versions.findIndex((v) => v.id === n.file) + 1);
    let answer = sentAt.has(n.id) ? later.find((v) => typeof v.agent === 'string' && v.at > sentAt.get(n.id)!) : undefined;
    if (!answer) {
      const goes = noteGoesTo(n, people);
      if (goes.to === 'person') answer = later.find((v) => v.by === goes.person && v.at > n.ts);
    }
    if (!answer || (settledAt.get(n.id) ?? -Infinity) >= answer.at) continue;
    out.push({ on: n.id, in: answer.id });
  }
  return out;
}

/* ---------------------------------- quotes ------------------------------- */

/** Where a quoted passage sits in some text, spacing aside. Returns offsets into `text`. */
export function findQuote(text: string | null | undefined, quote: string | null | undefined): { start: number; end: number } | null {
  const words = String(quote ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const hit = new RegExp(escaped.join('\\s+')).exec(String(text ?? ''));
  return hit ? { start: hit.index, end: hit.index + hit[0].length } : null;
}

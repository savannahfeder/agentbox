// PURE. Comments, approvals and versions of the files on a thread.
//
// A mark is the `artifact` field of one ledger line, a delta like `react`. The
// fold keeps every mark and hands them here to read back as `item.artifacts`.
// `file` is a version's id, the same on the owner's computer and a teammate's,
// where one file has two paths and two names (versionId below).

import { PLAIN_AGENT } from './agent-voice.mjs';

const MARK_ID = /^[\w-]{1,64}$/;
const FILE_ID = /^[^/\\\0]{1,160}$/;
const MAX_NOTE_CHARS = 4000;
// A whole section. With a full note, both in three-byte characters, still under the cloud's 24,000 for one mark.
export const MAX_QUOTE_CHARS = 3000;
const MAX_NAMED = 12;
const MAX_SEEN = 50;
// Under the 24,000 the cloud allows one mark, with room for the rest of it.
export const MAX_EDIT_BYTES = 20_000;
const byteLength = (s) => new TextEncoder().encode(s).length;
const documentPath = (v) => (typeof v === 'string' && !v.startsWith('/') && !v.split('/').includes('..') && /\.(?:md|markdown)$/i.test(v) && v.length <= 400 ? v : null);

const shortId = (v) => (typeof v === 'string' && MARK_ID.test(v) ? v : null);
const fileId = (v) => (typeof v === 'string' && FILE_ID.test(v) && v !== '.' && v !== '..' ? v : null);
const unit = (v) => typeof v === 'number' && v >= 0 && v <= 1;

function cleanPlace(place) {
  switch (place?.kind) {
    case 'pin': return unit(place.x) && unit(place.y) ? { kind: 'pin', x: place.x, y: place.y } : undefined;
    case 'time':
      if (!Number.isFinite(place.s) || place.s < 0) return undefined;
      return unit(place.x) && unit(place.y) ? { kind: 'time', s: place.s, x: place.x, y: place.y } : { kind: 'time', s: place.s };
    case 'page': {
      if (!Number.isInteger(place.n) || place.n < 1) return undefined;
      return { kind: 'page', n: place.n, ...(place.word === 'Slide' ? { word: 'Slide' } : {}), ...(unit(place.x) && unit(place.y) ? { x: place.x, y: place.y } : {}) };
    }
    case 'quote': {
      const text = typeof place.text === 'string' ? place.text.trim().slice(0, MAX_QUOTE_CHARS) : '';
      return text ? { kind: 'quote', text } : undefined;
    }
    case 'whole': return { kind: 'whole' };
    default: return undefined;
  }
}

/** A mark as the ledger may hold it, or undefined. A teammate's copy wrote it, so nothing is believed. */
export function cleanMark(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const owner = shortId(value.owner);
  switch (value.do) {
    case 'note': {
      const id = shortId(value.id);
      const file = fileId(value.file);
      const place = cleanPlace(value.place);
      const text = typeof value.text === 'string' ? value.text.trim().slice(0, MAX_NOTE_CHARS) : '';
      if (!id || !file || !place || !text) return undefined;
      const mentions = Array.isArray(value.mentions) ? [...new Set(value.mentions.map(shortId).filter(Boolean))].slice(0, MAX_NAMED) : [];
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
      const on = (Array.isArray(value.on) ? value.on : []).map(shortId).filter(Boolean).slice(0, MAX_SEEN);
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
    // What was decided about an agent's version that skipped someone's edit (main/version-reconcile.mjs).
    case 'reconcile': {
      const file = fileId(value.file);
      if (!file) return undefined;
      const path = value.path !== undefined ? documentPath(value.path) : null;
      const missed = value.missed !== undefined ? documentPath(value.missed) : null;
      const from = fileId(value.from);
      return { do: 'reconcile', file, ...(path ? { path } : {}), ...(missed ? { missed } : {}), ...(from ? { from } : {}), ...(Number.isInteger(value.clash) && value.clash > 0 ? { clash: value.clash } : {}), ...(value.replace === true ? { replace: true } : {}) };
    }
    default: return undefined;
  }
}

/** Only that this person has looked at something, which is nothing anyone else needs to read. */
export const isBookkeepingMark = (mark) => mark?.do === 'seen' || mark?.do === 'sent' || mark?.do === 'reconcile';

/**
 * Every mark on a thread, oldest first, as what it now says. Each entry is the
 * mark plus the `by` and `ts` of its line. The first note under an id stands, so
 * a later line cannot rewrite one, and only the approver can take an approval back.
 */
export function marksOf(entries) {
  const notes = new Map();
  const given = new Map();
  const pins = new Map();
  const seen = new Map();
  const sent = new Set();
  const toAgent = new Set();
  const settled = new Map();
  const replies = new Map();
  const edits = [];
  for (const e of entries ?? []) {
    if (e.do === 'edit' && e.path) {
      edits.push({ file: e.file, path: e.path, by: e.by ?? null, ts: e.ts });
    } else if (e.do === 'note' && !notes.has(e.id)) {
      const note = { id: e.id, file: e.file, place: e.place, text: e.text, by: e.by ?? null, ts: e.ts, mentions: e.mentions ?? [], owner: e.owner ?? null, uid: e.uid ?? null, ...(e.wait ? { wait: true } : {}) };
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
      for (const id of e.on) seen.get(who).add(id);
    } else if (e.do === 'sent') {
      for (const id of e.on) sent.add(id);
    } else if (e.do === 'toagent') {
      for (const id of e.on) toAgent.add(id);
    }
  }
  const answers = new Map();
  for (const r of [...replies.values()].sort((a, b) => a.ts - b.ts)) {
    if (!answers.has(r.on)) answers.set(r.on, []);
    answers.get(r.on).push({ id: r.id, text: r.text, by: r.by, ts: r.ts });
  }
  const list = [...notes.values()].map((n) => {
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
export const approvalId = (a) => `a${Math.trunc(Number(a.ts) || 0)}`;

const clock = (s) => {
  const whole = Math.floor(Number(s) || 0);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/** "Pin 2", "0:12", "Slide 3", the quote, "Whole file". */
export function placeWords(note) {
  const place = note?.place;
  switch (place?.kind) {
    case 'pin': return `Pin ${note.pin ?? 1}`;
    case 'time': return unit(place.x) ? `Pin ${note.pin ?? 1} at ${clock(place.s)}` : clock(place.s);
    case 'page': return unit(place.x) ? `Pin ${note.pin ?? 1} on ${place.word ?? 'Page'} ${place.n}` : `${place.word ?? 'Page'} ${place.n}`;
    case 'quote': return `“${place.text}”`;
    default: return 'Whole file';
  }
}

/* --------------------------------- versions ------------------------------ */

// `<sha12>-name`, how a shared thread names its copy, and `<time>-<random>-name`,
// how a saved attachment is named: main/team/thread-share.mjs, main/save-attachments.mjs.
const COPY_PREFIX = /^[0-9a-f]{12}-/;
const SAVED_PREFIX = /^[a-z0-9]{8}-[a-z0-9]{1,6}-/;

/** A file's name as a person gave it. */
// A copy carries a mark in its name: a thread's attachments, or a group's file as kept here.
const SENT_COPY = /(^|\/)(attachments|\.room-files)\//;

export function shownName(path) {
  const clean = String(path ?? '').split(/[?#]/)[0];
  const base = clean.split('/').pop() ?? '';
  // A hash in front is a shared thread's copy, even when an agent names it bare.
  if (!SENT_COPY.test(clean) && !COPY_PREFIX.test(base)) return base;
  return base.replace(COPY_PREFIX, '').replace(SAVED_PREFIX, '');
}

const KINDS = [
  ['image', /\.(png|jpe?g|gif|webp|svg)$/i],
  ['film', /\.(mp4|mov|m4v|webm)$/i],
  ['pdf', /\.pdf$/i],
  ['markdown', /\.(md|markdown)$/i],
  ['deck', /\.pptx$/i],
];
/** What the view can open, or null. */
export const reviewKind = (path) => KINDS.find(([, re]) => re.test(String(path ?? '').split(/[?#]/)[0]))?.[0] ?? null;

// Only what plainly means "another go at this file". A bare number does not:
// shot-3.png and shot-4.png are two shots.
const VERSION_TAIL = /(?:[-_ ]v\d+|\s*\(\d+\)|-\d+-|[-_ ](?:final|latest))$/i;

function baseStem(name) {
  const dot = name.lastIndexOf('.');
  let stem = dot > 0 ? name.slice(0, dot) : name;
  while (VERSION_TAIL.test(stem) && stem.replace(VERSION_TAIL, '')) stem = stem.replace(VERSION_TAIL, '');
  return stem;
}
const stemOf = (name) => baseStem(name).toLowerCase();

/** `group-seat-picker-v3.png` as `group-seat-picker.png`. */
export function baseName(name) {
  const dot = name.lastIndexOf('.');
  return `${baseStem(name)}${dot > 0 ? name.slice(dot) : ''}`;
}

// A page or a script is keyed by its stem and extension, as it was keyed by its
// whole name before versions of one folded, so where it was filed still holds.
function keyOf(name, path) {
  const stem = stemOf(name);
  const kind = reviewKind(path);
  if (kind) return `${stem}\0${kind}`;
  return `${stem}\0${baseName(name)}`;
}

const endsWithPath = (whole, part) => whole === part || whole.endsWith(`/${part}`);

/**
 * The files of a thread, grouped into families of versions, oldest version first
 * in the order they were first said. Each version has `id`, the name a mark uses
 * for it, `name`, `path`, `n` and `by`. The same name attached twice is two files
 * and two versions, since an attachment's saved name is new each time.
 *
 * `numbers` maps a path to its number on the file's version line
 * (shared/version-line.mjs). A family the line knows is numbered by it, in its
 * order, and a path the line does not know is no version of that family.
 */
export function threadFiles(files, numbers = null) {
  const families = new Map();
  const seenPaths = new Set();
  for (const f of files ?? []) {
    const path = String(f.path ?? '').replace(/^\.\//, '');
    if (!path || seenPaths.has(path)) continue;
    seenPaths.add(path);
    const name = shownName(path);
    const key = keyOf(name, path);
    let family = families.get(key);
    if (!family) { family = { key, versions: [] }; families.set(key, family); }
    const line = Number.isInteger(numbers?.[path]) ? numbers[path] : undefined;
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
    family.versions.push({ id, name, path, n: family.versions.length + 1, by: f.by ?? null, at: f.at ?? 0, ...(line !== undefined ? { line } : {}), ...(typeof f.agent === 'string' ? { agent: f.agent } : {}), ...(f.edited ? { edited: true } : {}), ...(f.newer ? { newer: true } : {}) });
  }
  const out = [...families.values()];
  for (const family of out) {
    if (!family.versions.some((v) => v.line !== undefined)) continue;
    const byLine = new Map();
    for (const v of family.versions) {
      if (v.line === undefined) continue;
      const was = byLine.get(v.line);
      if (was) (was.also ??= []).push(v.path, ...(v.also ?? []));
      else byLine.set(v.line, v);
    }
    family.versions = [...byLine.values()].sort((a, b) => a.line - b.line).map(({ line, ...v }) => ({ ...v, n: line }));
  }
  return out;
}

function cleanAsked(raw) {
  let p = String(raw ?? '').replace(/^file:\/\//, '').split(/[?#]/)[0];
  try { p = decodeURIComponent(p); } catch { /* left as written */ }
  return p.replace(/^\.\//, '');
}

/**
 * The version a card's path names, or null. Never another file: a path that
 * names nothing on the thread is not answered with whatever came last.
 */
/**
 * A thread's files as their lines number them (main/files-place.mjs lineFor):
 * the number of each path the thread said, and a line for each version made
 * elsewhere, so threadFiles counts every version the line holds.
 */
export function lineAsThread(line) {
  const numbers = {};
  const lines = [];
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
export function whereAPressLands(families, { path, file } = {}) {
  const flat = (families ?? []).flatMap((f, fi) => f.versions.map((v, vi) => ({ fi, vi, v })));
  const at = (x) => (x ? { fi: x.fi, vi: x.vi } : null);
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

/** The versions `paths` name, in their order, each once: what the arrows step through. */
export function stepsThrough(families, paths) {
  const out = [];
  const seen = new Set();
  for (const p of paths ?? []) {
    const v = versionForPath(families, p);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    const fi = families.findIndex((f) => f.versions.includes(v));
    out.push({ fi, vi: families[fi].versions.indexOf(v) });
  }
  return out;
}

/**
 * Where an arrow press from `at` goes, or null at an end. With steps, the next
 * of them; a version picked off the list keeps its family's place. Without,
 * the next file at its newest version.
 */
export function nextStep(families, steps, at, by) {
  if (!at) return null;
  if (steps?.length) {
    let i = steps.findIndex((s) => s.fi === at.fi && s.vi === at.vi);
    if (i < 0) i = steps.findIndex((s) => s.fi === at.fi);
    return i < 0 ? null : steps[i + by] ?? null;
  }
  const fi = at.fi + by;
  return families?.[fi] ? { fi, vi: families[fi].versions.length - 1 } : null;
}

export function versionForPath(families, raw) {
  const asked = cleanAsked(raw);
  if (!asked) return null;
  const all = (families ?? []).flatMap((f) => f.versions);
  const pathsOf = (v) => [v.path, ...(v.also ?? [])];
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
export const editedWords = (name, path) => `Updated ${name}.\n\n[${name}](${path})`;

// Files the big view does not review but Files still lists: a page an agent made,
// a script. Unlike reviewable kinds, a bare word in a sentence ("node.js") is no
// claim, so only a link or a code span counts, and Files keeps those really on disk.
const OTHER_KINDS = [['page', /\.html?$/i], ['table', /\.(csv|tsv)$/i], ['code', /\.(py|ipynb|js|mjs|ts|tsx|jsx|rb|go|rs|sh|sql|css|txt|json|ya?ml|xml)$/i]];
export const otherKind = (path) => OTHER_KINDS.find(([, re]) => re.test(String(path ?? '').split(/[?#]/)[0]))?.[0] ?? null;
/** Which page the big view draws for a file, or null. */
export const viewKind = (path) => reviewKind(path) ?? otherKind(path);
/** Whether a file pressed in a group opens in the big view: what it reviews, and a table. */
export const opensBigInAGroup = (name) => !!reviewKind(name) || otherKind(name) === 'table';
const OTHER_NAMED =/\]\(<?((?:\.?\/)?[^()\s>:]+\.[A-Za-z0-9]+)>?\)|`((?:\.?\/)?[\w.-]+(?:\/[\w.-]+)*\.[A-Za-z0-9]+)`/g;

// "-390.png" is the end of a name said before it, not a file.
const shorthand = (path) => /^[-_]/.test(path.split('/').pop() ?? '');

/** What filesInLines leaves out, in the same shape. A person's own words only count what they attached, a link. */
export function otherFilesInLines(lines) {
  const out = [];
  const seen = new Set();
  for (const l of lines ?? []) {
    const p = l?.patch;
    if (!p) continue;
    for (const field of ['result', 'note', 'body', 'answer']) {
      // OTHER_NAMED is a link or a code span, so it needs one of these.
      if (typeof p[field] !== 'string' || !(p[field].includes('](') || p[field].includes('`'))) continue;
      for (const m of p[field].replace(FENCE, '').matchAll(OTHER_NAMED)) {
        if (l.source === 'founder' && !m[1]) continue;
        const path = (m[1] ?? m[2]).replace(/^\.\//, '');
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
export function familyOfName(file) {
  const name = shownName(String(file ?? '').replace(/^\.\//, ''));
  return keyOf(name, name);
}

/** Every reviewable file a thread's lines name, in the order they name them. */
export function filesInLines(lines) {
  const out = [];
  const seen = new Set();
  for (const l of lines ?? []) {
    const p = l?.patch;
    if (!p) continue;
    if (p.artifact?.do === 'edit' && p.artifact.path && !seen.has(p.artifact.path)) {
      seen.add(p.artifact.path);
      out.push({ path: p.artifact.path, by: l.by ?? null, at: l.ts, edited: true });
    }
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
        if (seen.has(path) || shorthand(path)) continue;
        seen.add(path);
        const agent = p.voice?.name ?? (l.source === 'agent' ? '' : null);
        out.push({ path, by: l.by ?? null, at: l.ts, ...(agent !== null ? { agent } : {}), ...(edited ? { edited: true } : {}), ...(p.newer === true ? { newer: true } : {}) });
      }
    }
  }
  return out;
}

/** "Shared by …" for a version: the agent and who it works for when an agent shared it. */
export function sharedByWords(v, { me, nameOf }) {
  const whose = !v?.by || v.by === me ? null : nameOf(v.by);
  if (v?.edited) return `Edited by ${whose ?? 'you'}`;
  if (typeof v?.agent !== 'string') return `Shared by ${whose ?? 'you'}`;
  // A thread that is no AI teammate's speaks as plain "Agent", which names nobody.
  if (v.agent && v.agent !== PLAIN_AGENT) return `Shared by ${v.agent} for ${whose ?? 'you'}`;
  return whose ? `Shared by ${whose}'s agent` : 'Shared by your agent';
}

/** "Resolved by your agent in v15": a comment the version `v` answered. */
export function resolvedInWords(v, { me, nameOf }) {
  const whose = !v?.by || v.by === me ? null : nameOf(v.by);
  let who;
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
export function carriedNotes(family, index, notes, { resolved = false } = {}) {
  const earlier = new Map((family?.versions ?? []).slice(0, Math.max(0, index)).map((v) => [v.id, v]));
  return (notes ?? []).filter((n) => earlier.has(n.file) && (resolved || !n.resolved)).map((n) => ({ ...n, from: `v${earlier.get(n.file).n}` }));
}

/** What to tell someone editing version `baseN` when somebody else has saved since, or null. */
export function editClash(family, baseN, me, nameOf) {
  const versions = family?.versions ?? [];
  const other = versions.slice(baseN).filter((v) => v.by !== me).at(-1);
  if (!other) return null;
  return `${nameOf(other.by)} saved v${versions.indexOf(other) + 1} while you were editing. Yours saves as v${versions.length + 1}, with their changes merged in.`;
}

/** What a person calls a file at any version: one name, whatever each version is named on disk. */
export function familyName(family, version) {
  const all = family?.versions ?? [];
  if (all.length > 1) return baseName(all[0].name);
  return all[0]?.name ?? version?.name ?? '';
}

/** What to say on a version whose words changed after an earlier one was approved, or null. */
export function approvalSince(family, index, approvals, nameOf) {
  const versions = family?.versions ?? [];
  const here = versions[index];
  if (!here || (approvals ?? []).some((a) => a.file === here.id)) return null;
  const old = versions.slice(0, index).reverse().find((v) => (approvals ?? []).some((a) => a.file === v.id));
  if (!old) return null;
  const given = approvals.filter((a) => a.file === old.id).at(-1);
  return `${nameOf(given.by)} approved v${old.n}. ${nameOf(here.by)} changed it since, so this version is not approved.`;
}

/** What to ask before approving version `index`, or null: a newer version, or comments still open on it. */
export function approveAsk(family, index, notes) {
  const versions = family?.versions ?? [];
  const here = versions[index];
  if (!here) return null;
  const newest = index < versions.length - 1 ? versions.at(-1) : null;
  const open = (notes ?? []).filter((n) => n.file === here.id && !n.resolved).length + carriedNotes(family, index, notes).length;
  if (!newest && !open) return null;
  const said = [`Approve v${here.n}?`];
  if (newest) said.push(`v${newest.n} is newer.`);
  if (open) said.push(open > 1 ? `${open} comments are still open.` : '1 comment is still open.');
  return { text: said.join(' '), newest };
}

/** The newest edited copy of the file at `path`, or `path` when nobody has edited it. */
export function newestOfFamily(path, edits) {
  if (!edits?.length) return path;
  const family = threadFiles([{ path }, ...edits.map((e) => ({ path: e.path }))]).find((f) => f.versions.some((v) => v.path === String(path).replace(/^\.\//, '')));
  return family?.versions.at(-1)?.path ?? path;
}

/** The line that tells an agent which files people have edited, or null. Its own later version ends it. */
export function editedFilesLine(lines) {
  const families = threadFiles(filesInLines(lines));
  const moved = families.filter((f) => f.versions.at(-1)?.edited && f.versions.length > 1);
  const missedOn = new Map((lines ?? []).flatMap((l) => (l?.patch?.artifact?.do === 'reconcile' && l.patch.artifact.missed ? [[l.patch.artifact.file, l.patch.artifact.missed]] : [])));
  const missed = families.flatMap((f) => {
    const newest = f.versions.at(-1);
    return missedOn.has(newest?.id) ? [`${newest.path} was written without the edit in ${missedOn.get(newest.id)}`] : [];
  });
  const clashed = new Map((lines ?? []).flatMap((l) => (l?.patch?.artifact?.do === 'reconcile' && l.patch.artifact.clash && l.patch.artifact.path ? [[l.patch.artifact.path, l.patch.artifact.file]] : [])));
  const kept = moved.flatMap((f) => (clashed.has(f.versions.at(-1).path) ? [`${f.versions.at(-1).path} kept a person's words where your ${clashed.get(f.versions.at(-1).path)} changed the same ones`] : []));
  const said = [];
  if (moved.length) said.push(`People edited files on this thread. Read the newest version, not the copy you remember: ${moved.map((f) => `${f.versions[0].name} is now ${f.versions.at(-1).path}`).join('; ')}. An edit your next version leaves out is merged back in, so to undo one because they asked, pass replacesEdits to write_document.`);
  if (kept.length) said.push(`${kept.join('; ')}.`);
  if (missed.length) said.push(`${missed.join('; ')}. Read that edit and carry it across unless you were told otherwise.`);
  return said.join(' ') || null;
}

/** Who said the file first, which is who an approval or a note reaches in a conversation. */
export function whoseIsTheFile(files, id) {
  const hit = threadFiles(files).flatMap((f) => f.versions).find((v) => v.id === id);
  return hit?.by ?? null;
}

/* ---------------------------- who it waits on ---------------------------- */

/** Words written to you ("Maya, ...", "@Maya") or a question that names you. */
export function asksByName(text, name) {
  const first = firstWord(name);
  if (first.length < 2) return false;
  if (addressedTo(text, [{ id: 'you', name: first }])) return true;
  return String(text ?? '').includes('?') && new RegExp(`(?<![\\w@])${escaped(first)}(?![\\w'’])`, 'i').test(String(text ?? ''));
}

/**
 * What on this row is waiting on this person: notes on their file, notes naming
 * them and approvals of their file, from someone else, not yet seen or settled.
 */
export function fileNewsFor(item, me, { myName = null } = {}) {
  const marks = item?.artifacts;
  if (!marks || !me) return [];
  const seen = new Set(marks.seen?.[me] ?? []);
  const ownerOfRow = item.runner ?? item.createdBy ?? null;
  const asksMe = (text) => asksByName(text, myName);
  const news = [];
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
  const onIt = (item.people ?? []).includes(me);
  for (const a of marks.approvals ?? []) {
    const id = approvalId(a);
    if (a.by === me || seen.has(id) || ((a.owner ?? ownerOfRow) !== me && !onIt)) continue;
    news.push({ kind: 'approved', id, by: a.by, ts: a.ts, file: a.file });
  }
  // Your own Done settles what came before it, or the closed thread stays in Needs you.
  const close = item.status === 'done' && item.wrote?.status?.by === me ? item.wrote.status.ts : 0;
  return news.filter((n) => n.ts > close).sort((x, y) => x.ts - y.ts);
}

const visibleName = (id) => String(id ?? '').replace(/#\d+$/, '');

/** A row's line for what waits: "Maya approved onboarding-a.png". */
export function fileNewsLine(news, nameOf) {
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
export function nextVersionName(name, count) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';
  let stem = dot > 0 ? name.slice(0, dot) : name;
  // A thread that only holds v7 still asks for v8, not v2.
  const named = Number(/[-_ ]v(\d+)$/i.exec(stem)?.[1] ?? 0);
  while (VERSION_TAIL.test(stem) && stem.replace(VERSION_TAIL, '')) stem = stem.replace(VERSION_TAIL, '');
  return `${stem}-v${Math.max(count, named) + 1}${ext}`;
}

/** The open notes on this version not yet sent to the agent, as the words that send them. */
export function notesForTheAgent(marks, version, count, { nameOf = () => 'Someone' } = {}) {
  const open = (marks?.notes ?? []).filter((n) => n.file === version.id && !n.resolved && !n.sent);
  const say = (n) => {
    const at = unit(n.place.x)
      ?`${placeWords(n)}, ${Math.round(n.place.x * 100)}% across and ${Math.round(n.place.y * 100)}% down`
      : placeWords(n);
    return `- ${at}: ${n.text} (${nameOf(n.by)})`;
  };
  const text = [
    `Notes on ${version.path}:`,
    ...open.map(say),
    '',
    `Make these changes and save the result as ${nextVersionName(version.name, count)} beside the original, keeping the original as it is. Name the new file in your reply so it opens as the next version of ${baseName(version.name)}. The app gives every version its number, the same for everyone, so call it the next version, not a number of your own.`,
  ].join('\n');
  return { text, ids: open.map((n) => n.id) };
}

const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const firstWord = (name) => String(name ?? '').trim().split(/\s+/)[0] ?? '';

/** The teammate a note opens on ("Sofia, ...", "Hey Sofia:") or names with @, by id, or null. */
export function addressedTo(text, people) {
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
export function onlyThanks(text) {
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
export function noteGoesTo(note, people = []) {
  if (note?.toAgent) return { to: 'agent' };
  const named = note?.mentions?.[0] ?? addressedTo(note?.text, people);
  if (named) return { to: 'person', person: named };
  const text = String(note?.text ?? '').trim();
  // "Sam, approved" names nobody on the team, so it is read past the name, and
  // tried whole too, because "Thanks," reads like a name.
  if (onlyThanks(text) || onlyThanks(text.replace(/^@?[A-Z][\w'-]*\s*[,:]\s*/, ''))) return { to: 'nobody' };
  return { to: 'agent' };
}

/** Every file a thread names that a note can be on: pictures, films and documents, then pages and scripts. */
export const notedFilesInLines = (lines) => [...filesInLines(lines), ...otherFilesInLines(lines)];

/**
 * A teammate's open notes on the files an agent made on this thread, one turn
 * per file, in the words "Send these notes to the agent" uses. Notes by `me`,
 * the owner, wait for the owner's own press.
 */
/** A note held for Send that nobody has sent yet. */
export const stillWaiting = (note) => !!note?.wait && !note.toAgent && !note.sent;

export function notesForItsAgent(lines, marks,{ me, nameOf = () => 'Someone', people = [] } = {}) {
  const out = [];
  for (const family of threadFiles(notedFilesInLines(lines))) {
    for (const version of family.versions) {
      if (typeof version.agent !== 'string') continue;
      const open = (marks?.notes ?? []).filter((n) => n.file === version.id && n.by && n.by !== me && !n.resolved && !n.sent && !stillWaiting(n) && noteGoesTo(n, people).to === 'agent');
      if (!open.length) continue;
      const first = (id) => String(nameOf(id)).split(/\s+/)[0];
      const { text, ids } = notesForTheAgent({ notes: open }, version, family.versions.length, { nameOf: first });
      out.push({ by: open[0].by, ids, text: `${nameOf(open[0].by)} left notes on ${version.name}, a file you made on this thread.\n\n${text}` });
    }
  }
  return out;
}

/**
 * The open comments a later version of their file answered: one sent to the
 * agent, by the agent's next version; one written to a teammate, by that
 * teammate's next version. A reopen after that version keeps it open.
 * Returns `[{ on, in }]`, the comment and the version.
 */
export function answeredNotes(lines, { people = [] } = {}) {
  const entries = [];
  const sentAt = new Map();
  const settledAt = new Map();
  for (const l of lines ?? []) {
    const a = l?.patch?.artifact;
    if (!a) continue;
    entries.push({ ...a, by: l.by ?? null, ts: l.ts });
    if (a.do === 'sent') for (const id of a.on ?? []) if (!sentAt.has(id)) sentAt.set(id, l.ts);
    if (a.do === 'resolve' || a.do === 'reopen') settledAt.set(a.on, Math.max(settledAt.get(a.on) ?? -Infinity, l.ts));
  }
  // Notes told to an agent name the file it should make, which is no version until it does.
  const families = threadFiles(notedFilesInLines((lines ?? []).filter((l) => !l?.patch?.fromNotes)));
  const out = [];
  for (const n of marksOf(entries).notes) {
    if (n.resolved) continue;
    const family = families.find((f) => f.versions.some((v) => v.id === n.file));
    if (!family) continue;
    const later = family.versions.slice(family.versions.findIndex((v) => v.id === n.file) + 1);
    let answer = sentAt.has(n.id) ? later.find((v) => typeof v.agent === 'string' && v.at > sentAt.get(n.id)) : undefined;
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
export function findQuote(text, quote) {
  const words = String(quote ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const hit = new RegExp(escaped.join('\\s+')).exec(String(text ?? ''));
  return hit ? { start: hit.index, end: hit.index + hit[0].length } : null;
}

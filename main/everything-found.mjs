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
import { resolveArtifact } from './artifact-path.mjs';
import { filesInLines, marksOf, reviewKind, threadFiles } from '../shared/artifact-marks.mjs';
import { editOfLine, resolveEdits } from '../shared/message-edits.mjs';
import { firstHit, fold, holds, queryOf, windowAround } from '../shared/word-match.mjs';
import { withoutFileHomes } from '../shared/file-home.mjs';

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

const said = (v) => (typeof v === 'string' && v.trim() ? v : null);
// Read as words: a link is its label, and no mark-up or address is matched or shown.
// A cloud run's asks are cards in the thread; elsewhere they are machine words.
const plain = (text) => text
  .replace(/^\s*`?AGENTBOX-NEEDS:\s*(sign-in|key|file|code)\s.*$/gim, '')
  .replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, '$1')
  .replace(/```[^\n]*\n?/g, '')
  .replace(/^\s{0,3}#{1,6}\s+/gm, '')
  .replace(/(\*\*|__|`)/g, '');
const clip = (text) => plain(text.length > MESSAGE_CHARS ? text.slice(0, MESSAGE_CHARS) : text);
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** The messages in a thread's ledger lines: who wrote them, when, and the line they can be opened at. */
export function messagesOf(lines) {
  const edits = resolveEdits(
    (lines ?? []).filter((l) => l?.patch && !l.patch.edit).map((l) => ({ uid: l.uid ?? null, by: l.by ?? null })),
    (lines ?? []).map(editOfLine).filter(Boolean),
  );
  const out = [];
  let firstBodyTaken = false;
  for (const l of lines ?? []) {
    const p = l?.patch;
    if (!p || l.claim || l.heartbeat || l.release || p.edit) continue;
    const edit = l.uid ? edits.get(l.uid) : undefined;
    if (edit?.gone) continue;
    const at = Number(l.ts) || 0;
    const base = { uid: l.uid ?? `at-${at}`, by: l.by ?? null, at, source: l.source === 'founder' ? 'founder' : l.source === 'system' ? 'system' : 'agent' };
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
export function filesAndNotesOf(lines) {
  const families = threadFiles(filesInLines(lines));
  const versions = new Map(families.flatMap((f) => f.versions.map((v) => [v.id, { v, family: f }])));
  const entries = (lines ?? []).filter((l) => l?.patch?.artifact).map((l) => ({ ...l.patch.artifact, by: l.by ?? null, ts: l.ts, uid: l.uid ?? null }));
  const notes = marksOf(entries).notes.flatMap((n) => {
    const hit = versions.get(n.file);
    return hit ? [{ id: n.id, file: n.file, text: n.text, by: n.by, at: n.ts, resolved: !!n.resolved, place: n.place, pin: n.pin, src: hit.v.path, name: hit.v.name }] : [];
  });
  const files = families.map((f) => {
    const newest = f.versions[f.versions.length - 1];
    return { src: newest.path, name: newest.name, by: newest.by, at: newest.at, kind: reviewKind(newest.path) };
  });
  return { files, notes };
}

export function createFinder({ listThreads, loadThread, readText = async () => null, now = Date.now }) {
  // key -> { version, builtAt, hasText, messages, files, notes }
  const built = new Map();
  const building = new Map();

  async function build(t) {
    const loaded = await loadThread(t);
    const { files, notes } = filesAndNotesOf(loaded.lines);
    const messages = messagesOf(loaded.lines).map((m) => ({ ...m, f: fold(m.text) }));
    const fileRows = [];
    for (const f of files) {
      const row = { ...f, f: fold(f.name), lines: [] };
      if (f.kind === 'markdown' && loaded.resolve) {
        const file = await loaded.resolve(f.src).catch(() => null);
        const text = file ? await readText(file, MARKDOWN_BYTES).catch(() => null) : null;
        if (text) row.lines = text.split(/\r?\n/).map((s) => plain(s).trim()).filter(Boolean).map((s) => ({ text: s, f: fold(s) }));
      }
      fileRows.push(row);
    }
    const noteRows = notes.map((n) => ({ ...n, f: fold(n.text) }));
    const entry = {
      version: t.version, builtAt: now(), hasText: fileRows.some((f) => f.lines.length > 0 || f.kind === 'markdown'),
      messages, files: fileRows, notes: noteRows,
    };
    built.set(t.key, entry);
    return entry;
  }

  function ensure(t) {
    let run = building.get(t.key);
    if (!run) {
      run = build(t).catch(() => built.get(t.key) ?? null).finally(() => building.delete(t.key));
      building.set(t.key, run);
    }
    return run;
  }

  const staleOf = (t, entry) => !entry || entry.version !== t.version || (entry.hasText && now() - entry.builtAt > LOOK_AGAIN_MS);

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

  async function search(query, { lines = 6, files = 5, comments = 5 } = {}) {
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

    const foundLines = [];
    const foundFiles = [];
    const foundNotes = [];
    for (const t of threads) {
      const entry = built.get(t.key);
      if (!entry) continue;
      const where = { kind: t.kind, product: t.product ?? null, id: t.id ?? null, ownerId: t.ownerId ?? null, threadId: t.threadId ?? null, updatedAt: t.updatedAt ?? 0 };
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
    const newest = (a, b) => (b.rank ?? 0) - (a.rank ?? 0) || (b.m ?? b.n).at - (a.m ?? a.n).at;
    const byName = (a, b) => (!!a.name === !!b.name ? b.f.at - a.f.at : a.name ? -1 : 1);
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
export function readableSharedThreads({ cards, me, folders }) {
  const open = new Set((cards ?? []).filter((c) => c && c.personId && c.personId !== me && c.visible !== false).map((c) => `${c.personId}/${c.threadId}`));
  return (folders ?? []).filter((f) => open.has(`${f.ownerId}/${f.threadId}`));
}

/** The whole store and the shared threads, as the finder reads them. */
export function appFinder({ store, team, readableProducts, accountRoot, storeRoot, now = Date.now }) {
  const texts = new Map();
  const readText = async (file, max) => {
    const st = await fs.promises.stat(file);
    if (!st.isFile() || st.size > max) return null;
    const was = texts.get(file);
    if (was && was.mtimeMs === st.mtimeMs && was.size === st.size) return was.text;
    const text = await fs.promises.readFile(file, 'utf8');
    texts.set(file, { mtimeMs: st.mtimeMs, size: st.size, text });
    if (texts.size > 400) texts.delete(texts.keys().next().value);
    return text;
  };
  // `inside` keeps a teammate's message from pointing the finder at a path of
  // its own choosing on this computer: only the copies in their thread's folder.
  const resolveIn = (product, inside = null) => async (src) => {
    const found = await resolveArtifact({ src, product, products: readableProducts(), accountRoot, storeRoot });
    if (!found.ok) return null;
    if (!inside) return found.path;
    try {
      const real = fs.realpathSync(found.path);
      return real.startsWith(fs.realpathSync(inside) + path.sep) ? real : null;
    } catch { return null; }
  };
  // Listing folds every project, so a burst of keystrokes shares one listing.
  let listed = { at: -Infinity, threads: [] };
  const listThreads = () => {
    if (now() - listed.at < 2000) return listed.threads;
    const direct = new Set(store.listProducts().filter((p) => p.team?.direct).map((p) => p.slug));
    const mine = withoutFileHomes(store.listAllWorkItems()).map((i) => ({
      key: `${i.product}/${i.id}`, kind: direct.has(i.product) ? 'chat' : 'thread', product: i.product, id: i.id, version: i.updatedAt, updatedAt: i.updatedAt,
    }));
    const theirs = (team?.sharedThreads?.() ?? []).map((s) => ({
      key: `shared/${s.ownerId}/${s.threadId}`, kind: 'shared', ownerId: s.ownerId, threadId: s.threadId, version: s.version, updatedAt: s.updatedAt ?? 0,
    }));
    listed = { at: now(), threads: [...mine, ...theirs] };
    return listed.threads;
  };
  const loadThread = async (t) => {
    if (t.kind === 'shared') {
      const w = team.threadWork(t.ownerId, t.threadId);
      return { lines: w.shared ? w.lines : [], resolve: w.product && w.dir ? resolveIn(w.product, w.dir) : null };
    }
    return { lines: store.readHistory(t.product, t.id, { max: Number.MAX_SAFE_INTEGER }), resolve: resolveIn(t.product) };
  };
  return createFinder({ listThreads, loadThread, readText, now });
}

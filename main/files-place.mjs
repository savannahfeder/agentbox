// THE FILES PLACE: every file a person may read, by project, each one file
// whatever threads and chats it went to. A file is its name's family of
// versions within a project (shared/artifact-marks.mjs); its comments and
// approvals are those made on any copy of it. Only the threads the caller
// lists are read: your own, and the teammates' threads the cloud shows you.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveArtifact } from './artifact-path.mjs';
import { approvalId, baseName, editedWords, familyName, familyOfName, filesInLines, marksOf, MAX_EDIT_BYTES, otherFilesInLines, otherKind, reviewKind, shownName, threadFiles } from '../shared/artifact-marks.mjs';
import { saveNextVersion } from './file-version.mjs';
import { versionLine } from './version-line.mjs';
import { cleanFolderName, fileKeyIn, folderNamed, foldFolders, newFolderId, readFolderLog, writeFolderLog } from '../shared/file-folders.mjs';
import { projectSeenBy } from '../shared/thread-cards.mjs';
import { shownTitle } from '../shared/thread-title.mjs';

const entriesOf = (lines) => (lines ?? []).filter((l) => l?.patch?.artifact)
  .map((l) => ({ ...l.patch.artifact, by: l.by ?? null, ts: l.ts, uid: l.uid ?? null }));

const projectKey = (name) => String(name ?? '').trim().toLowerCase();
// A family key holds a \0, which Postgres text cannot.
const toCloudFamily = (family) => family.split('\0').map(encodeURIComponent).join('/');
const fromCloudFamily = (family) => String(family).split('/').map(decodeURIComponent).join('\0');
const CROSS_EVERY_MS = 10_000;
const FILES_FOR_AGENTS = 40;

/**
 * Threads to files. A thread is `{ ref, title, project, lines }`, where `ref`
 * says how to reach it (`kind` thread, chat or shared) and `project` is a
 * project's name, null for a chat. A chat's copy joins the project file of the
 * same name, as the agent's tools match it (mcp/core/reach.mjs).
 */
/** Counts for tests: how many threads were parsed for their files. */
export const filesOfInternals = { parses: 0, entries: 0 };

// Every list of Files reads every thread, so a thread is parsed again only when
// its lines did: one agent writing must not re-read thousands of threads.
const PARSED_KEEP = 20000;
const parsed = new Map();
const refKey = (r) => `${r.kind}:${r.ownerId ?? r.product ?? ''}:${r.threadId ?? r.id ?? r.roomId ?? ''}`;
const linesKey = (lines) => { const last = lines.at(-1); return `${lines.length}#${last?.ts ?? ''}#${JSON.stringify(last?.patch ?? last ?? null)?.length ?? 0}`; };

export function filesOf(threads) {
  const files = new Map();
  const add = (key, project, family, thread, marks) => {
    let f = files.get(key);
    if (!f) { f = { key, project, familyKey: family.key, copies: [] }; files.set(key, f); }
    f.copies.push({ thread, family, marks });
  };
  // A teammate's words relayed to an agent name a file of their conversation, never of this thread.
  const ownLines = (t) => t.lines.filter((l) => !(l?.source === 'system' && l.patch?.from));
  const read = (t) => {
    const key = `${refKey(t.ref)}@${linesKey(t.lines)}`;
    const had = parsed.get(key);
    if (had) return had;
    filesOfInternals.parses += 1;
    const out = { families: threadFiles([...filesInLines(ownLines(t)), ...otherFilesInLines(ownLines(t))]), marks: marksOf(entriesOf(t.lines)) };
    if (parsed.size >= PARSED_KEEP) parsed.delete(parsed.keys().next().value);
    parsed.set(key, out);
    return out;
  };
  const chats = [];
  const named = [];
  for (const t of threads) {
    const { families, marks } = read(t);
    if (!families.length) continue;
    if (t.ref.kind === 'chat' || t.ref.kind === 'room') { chats.push({ t, families, marks }); continue; }
    for (const fam of families) named.push({ t, fam, marks });
  }
  // Only a file of the same name can be another thread's home for it. Oldest
  // first, so the first thread that qualifies is the oldest one.
  const sameName = new Map();
  for (const e of named) {
    const list = sameName.get(e.fam.key);
    if (list) list.push(e); else sameName.set(e.fam.key, [e]);
  }
  for (const list of sameName.values()) list.sort((a, b) => firstAt(a.fam) - firstAt(b.fam));
  for (const e of named) {
    const project = homeElsewhere(e, sameName.get(e.fam.key)) ?? e.t.project;
    add(`${projectKey(project)}\0${e.fam.key}`, project, e.fam, e.t, e.marks);
  }
  const inProjects = new Map();
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
const firsts = new WeakMap();
const firstAt = (fam) => {
  if (!firsts.has(fam)) firsts.set(fam, Math.min(...fam.versions.map((v) => v.at || 0)));
  return firsts.get(fam);
};
const idSets = new WeakMap();
const idsOf = (fam) => {
  if (!idSets.has(fam)) idSets.set(fam, new Set(fam.versions.map((v) => v.id)));
  return idSets.get(fam);
};

/**
 * The project whose file a thread's family belongs to when that is not the
 * thread's own: the thread names a version another project's file holds, and
 * either it is a kept copy of a connection, or this thread's version of that
 * name is not on its own disk (so it read the other file) and the thread adds
 * a version or can say so. Only an older file is joined, so two never swap.
 * `named` is oldest first, so the first that qualifies is the answer.
 */
function homeElsewhere({ t, fam }, named) {
  const here = new Map();
  const ownHere = (v) => {
    if (!here.has(v.path)) here.set(v.path, (t.dirs ?? []).some((d) => d && !path.isAbsolute(v.path) && fs.existsSync(path.join(d, v.path))));
    return here.get(v.path);
  };
  const mine = firstAt(fam);
  const home = projectKey(t.project);
  let allHere;
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
const copyTitle = (name, chain) => (chain.every((v) => v.copies.every((c) => COPY_PATH.test(c.path))) ? name.replace(COPY_ID_TAIL, '$1') : name);

// A copy in your own thread is where a new comment goes, so the agent that made it
// reads it there; a teammate's thread next, which reaches its owner; a chat last.
const PREFER = { thread: 0, shared: 1, chat: 2, room: 3 };
// An edit goes where its people will read it: a chat reaches only the one person in it.
const EDITS_GO = { thread: 0, shared: 1, room: 2, chat: 3 };

/**
 * The thread an edit of this file lands on. A file a group made, the Team look
 * above all, is edited in the group even where a thread links it: the group's
 * version is the one everybody and every agent reads, and a teammate's thread
 * would hold the words until their computer took them.
 */
export function whereEditsGo(chain) {
  const first = [...(chain[0]?.copies ?? [])].sort((a, b) => (a.at || 0) - (b.at || 0))[0];
  if (first?.thread.ref.kind === 'room') return first.thread;
  const places = [...new Set(chain.flatMap((v) => v.copies.map((c) => c.thread)))];
  return places.sort((a, b) => EDITS_GO[a.ref.kind] - EDITS_GO[b.ref.kind])[0] ?? null;
}

// Each person's newest approval of any version.
function newestEach(approvals) {
  const by = new Map();
  for (const a of approvals) if (!(by.get(a.by)?.at >= a.ts)) by.set(a.by, { by: a.by ?? null, at: a.ts || 0 });
  return [...by.values()];
}

function summary(f) {
  const versions = new Map();
  const notes = [];
  const approvals = [];
  const seen = {};
  for (const c of [...f.copies].sort((a, b) => PREFER[a.thread.ref.kind] - PREFER[b.thread.ref.kind])) {
    const ids = new Set(c.family.versions.map((v) => v.id));
    // A teammate's copy publishes its agent's lines with no author: they are its owner's.
    const ownerOf = c.thread.ref.kind === 'shared' ? c.thread.ref.ownerId : null;
    for (const v of c.family.versions) {
      const was = versions.get(v.id);
      if (!was) versions.set(v.id, { id: v.id, name: v.name, at: v.at, by: v.by ?? ownerOf, ...(typeof v.agent === 'string' ? { agent: v.agent } : {}), ...(v.edited ? { edited: true } : {}), copies: [{ thread: c.thread, path: v.path, at: v.at || 0 }] });
      else { was.copies.push({ thread: c.thread, path: v.path, at: v.at || 0 }); if (v.at && (!was.at || v.at < was.at)) was.at = v.at; }
    }
    // `deck.pdf@3` is a version by its number on the line, which a thread may not hold itself.
    const onIt = (file) => ids.has(file) || (/@\d+$/.test(file) && familyOfName(file.replace(/@\d+$/, '')) === c.family.key);
    for (const n of c.marks.notes) if (onIt(n.file)) notes.push({ ...n, thread: c.thread });
    for (const a of c.marks.approvals) if (onIt(a.file)) approvals.push({ ...a, thread: c.thread });
    for (const [who, list] of Object.entries(c.marks.seen ?? {})) seen[who] = [...new Set([...(seen[who] ?? []), ...list])];
  }
  const chain = [...versions.values()].sort((a, b) => (a.at || 0) - (b.at || 0)).map((v, i) => ({ ...v, n: i + 1 }));
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
    sentIn: places.map((t) => ({ ...t.ref, title: t.title })),
    chain, notes, approvals, seen,
  };
}

/** What the big view draws: one line per version, every comment from every copy. */
function viewOf(file, opened) {
  const lines = file.chain.map((v) => (v.edited
    ? { ts: v.at, by: v.by, source: 'founder', patch: { artifact: { do: 'edit', file: v.id, path: opened.get(v.id) } } }
    : {
      ts: v.at, by: v.by, source: typeof v.agent === 'string' ? 'agent' : 'system',
      patch: { note: `[${v.name}](${opened.get(v.id)})`, ...(v.agent ? { voice: { name: v.agent } } : {}) },
    }));
  const many = file.sentIn.length > 1;
  // Each copy numbers its own pins from 1; here they are one file's pins.
  const pins = new Map();
  const notes = [...file.notes].sort((a, b) => a.ts - b.ts).map(({ thread, ...n }) => {
    const out = { ...n, ...(many ? { in: thread.title } : {}) };
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
export function appFilesPlace({ store, team = null, accountRoot, storeRoot, notify = () => {} }) {
  const built = new Map();
  const logDir = () => store.teammates?.dir?.() ?? storeRoot;
  let held = { folders: [], places: [] };
  let crossingNow = null;
  let lastCrossed = 0;
  const familyIn = (key) => key.slice(key.indexOf('\0') + 1);

  // What this copy has said and what the cloud holds, newest word winning.
  function shelf() {
    return foldFolders([
      ...readFolderLog(logDir()),
      ...held.folders.map((f) => ({ op: 'folder', ...f })),
      ...held.places.map((p) => ({ op: 'place', key: `${projectKey(p.project)}\0${fromCloudFamily(p.family)}`, ...p })),
    ]);
  }

  /** null is the whole team, a list is chosen people, 'private' never leaves this computer. */
  function audienceOf(project) {
    const state = team?.state?.() ?? {};
    const me = state.me?.id;
    const key = projectKey(project);
    const mine = store.listProducts().find((p) => !p.team?.direct && projectKey(p.name) === key);
    if (mine) {
      const seen = projectSeenBy(mine);
      if (seen.who === 'private') return 'private';
      return seen.who === 'people' ? [...new Set([...seen.people, me])] : null;
    }
    // A teammate's project is known here only by the cards it shows this person.
    const cards = (state.cards ?? []).filter((c) => projectKey(c.project) === key);
    if (!cards.length) return 'private';
    if (cards.some((c) => c.people == null)) return null;
    return [...new Set(cards.flatMap((c) => [...c.people, c.personId]).concat(me))];
  }

  // The threads the cloud shows a card for: a place on any other names a file
  // somebody may not be allowed to know about.
  function anchorsOf(file, state) {
    const cards = new Set((state.cards ?? []).map((c) => `${c.personId}/${c.threadId}`));
    const out = [];
    for (const s of file.sentIn) {
      const owner = s.kind === 'shared' ? s.ownerId : s.kind === 'thread' ? state.me?.id : null;
      const threadId = s.kind === 'shared' ? s.threadId : s.id;
      if (owner && cards.has(`${owner}/${threadId}`)) out.push({ owner, threadId });
    }
    return out;
  }

  async function crossOnce() {
    const cloud = team?.fileFolders?.();
    if (!cloud) return;
    const before = JSON.stringify(held);
    const moved = await lineNow().refresh().catch((err) => { console.warn(`files: the version line did not cross: ${err.message}`); return false; });
    held = await cloud.read();
    const state = team.state();
    const local = foldFolders(readFolderLog(logDir()));
    const seenFolder = new Map(held.folders.map((f) => [f.id, f]));
    let wrote = false;
    const quietly = async (what, fn) => {
      try { await fn(); wrote = true; } catch (err) { console.warn(`files: ${what}: ${err.message}`); }
    };
    for (const f of local.folders) {
      const was = seenFolder.get(f.id);
      if (was && was.at >= f.at) continue;
      const people = was ? was.people : audienceOf(f.project);
      if (people === 'private') continue;
      await quietly('sending a folder', () => cloud.putFolder({ id: f.id, project: f.project, name: f.name, parent: f.parent, people, at: f.at }));
    }
    if (wrote) held = await cloud.read();
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
    if (wrote) held = await cloud.read();
    if (moved || JSON.stringify(held) !== before) notify();
  }

  /** One pass of folders and places to and from the cloud. A pass that fails is the next pass's to do. */
  async function crossing() {
    while (crossingNow) await crossingNow;
    lastCrossed = Date.now();
    crossingNow = crossOnce().catch((err) => { console.warn(`files: folders did not cross: ${err.message}`); }).finally(() => { crossingNow = null; });
    return crossingNow;
  }
  const crossSoon = () => { if (!crossingNow && Date.now() - lastCrossed > CROSS_EVERY_MS) void crossing(); };

  const historyOf = (key, version, read) => {
    const was = built.get(key);
    if (was && was.version === version) return was.lines;
    const lines = read();
    built.set(key, { version, lines });
    return lines;
  };
  const readable = () => [...store.listProducts(), ...(team?.sharedThreadProducts?.() ?? [])];

  // A thread's entry and its part of allFiles' signature, kept while its lines
  // and its project are the same objects and names they were.
  const entries = new Map();
  const sigs = new WeakMap();
  const sigOf = (t) => sigs.get(t) ?? `${refKey(t.ref)}@${linesKey(t.lines)}|${t.title}|${t.project}|${(t.dirs ?? []).join(',')}`;

  function threads() {
    const state = team?.state?.() ?? {};
    const me = state.me?.id ?? null;
    const firstOf = (id) => (state.people ?? []).find((p) => p.id === id)?.name?.split(/\s+/)[0] ?? 'someone';
    const out = [];
    const bySlug = new Map(store.listProducts().map((p) => [p.slug, p]));
    const readers = new Map();
    const readerOf = (slug) => {
      if (!readers.has(slug)) readers.set(slug, store.historyReader?.(slug) ?? ((id, o) => store.readHistory(slug, id, o)));
      return readers.get(slug);
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
      const others = [...new Set([...(product.team?.people ?? []), product.team?.sharedBy, ...(item.people ?? [])])].filter((p) => p && p !== me);
      const entry = {
        ref: { kind: chat ? 'chat' : 'thread', product: product.slug, id: item.id },
        title: chat ? `Chat with ${others.map(firstOf).join(', ') || 'yourself'}` : shownTitle(item),
        project: chat ? null : product.name,
        dirs: chat ? [] : [product.dir, product.repoPath, product.repoPath ? path.join(product.repoPath, '.claude', 'worktrees', item.id) : null].filter(Boolean),
        lines,
      };
      if (!chat) {
        sigs.set(entry, sigOf(entry));
        entries.set(key, { entry, lines, name: product.name, dir: product.dir, repo: product.repoPath });
      }
      out.push(entry);
    }
    const cards = new Map((state.cards ?? []).map((c) => [`${c.personId}/${c.threadId}`, c]));
    for (const s of team?.sharedThreads?.() ?? []) {
      const card = cards.get(`${s.ownerId}/${s.threadId}`);
      if (!card) continue;
      const work = team.threadWork(s.ownerId, s.threadId);
      if (!work?.shared) continue;
      out.push({
        ref: { kind: 'shared', ownerId: s.ownerId, threadId: s.threadId, product: work.product },
        title: card.title ?? 'Thread', project: card.project ?? null, lines: work.lines,
      });
    }
    const groups = state.rooms;
    for (const room of groups?.rooms ?? []) {
      const said = (groups.messages?.[room.id] ?? []).filter((m) => !m.deleted)
        .map((m) => ({ id: m.id, ts: m.at, by: m.by, source: 'founder', patch: { body: m.body } }));
      const marked = (groups.fileMarks?.[room.id] ?? [])
        .map((m) => ({ id: m.id, ts: m.at, by: m.by, source: 'system', patch: { artifact: m.mark } }));
      out.push({ ref: { kind: 'room', roomId: room.id }, title: room.name || 'Group', project: null, lines: [...said, ...marked] });
    }
    return out;
  }

  // The same threads give the same files: an open thread asks on every change in the app.
  let last = { sig: null, files: [] };
  const allFiles = () => {
    const ts = threads();
    const sig = ts.map(sigOf).join('\n');
    if (sig !== last.sig) last = { sig, files: filesOf(ts) };
    return last.files;
  };
  const find = (key) => allFiles().find((f) => f.key === key) ?? null;

  const onDisk = async (src, product, thread = null, products = readable()) => {
    const found = await resolveArtifact({ src, product, products, accountRoot, storeRoot, thread });
    return found.ok ? found.path : null;
  };

  // An open file asks for every copy it names on each change in the app, so a
  // project's copies are found and hashed once per state of the threads.
  let copiesFor = { files: null, products: null, byProject: new Map() };
  const copiesNow = (files) => {
    if (copiesFor.files !== files) copiesFor = { files, products: readable(), byProject: new Map() };
    return copiesFor;
  };
  function copiesIn(files, project) {
    const { products, byProject } = copiesNow(files);
    const key = projectKey(project);
    if (!byProject.has(key)) {
      byProject.set(key, (async () => {
        const out = [];
        for (const f of files) {
          if (projectKey(f.project) !== key) continue;
          for (const v of f.chain) {
            for (const c of v.copies) {
              const there = await onDisk(c.path, c.thread.ref.product, null, products);
              const bytes = there && await bytesOf(there).catch(() => null);
              if (bytes) out.push({ f, v, c, bytes });
            }
          }
        }
        return out;
      })());
    }
    return byProject.get(key);
  }
  const nameInRoom = (src) => String(src).replace(/^\.?\/?attachments\//, '');
  // A group's file may still be in the cloud, and drawing the list fetches nothing.
  async function openedOf(file, v, { fetch = false } = {}) {
    for (const c of v.copies) {
      const { ref } = c.thread;
      const found = ref.kind === 'room'
        ? await (fetch ? team.rooms.fileOnDisk(ref.roomId, nameInRoom(c.path)).catch(() => null) : team.rooms.fileIfKept(ref.roomId, nameInRoom(c.path)))
        : await onDisk(c.path, ref.product, ref.kind === 'thread' ? ref.id : null);
      if (found) return found;
    }
    return null;
  }
  const lines = new Map();
  const lineNow = () => {
    const dir = path.join(logDir(), '.file-versions');
    if (!lines.has(dir)) lines.set(dir, versionLine({ dir, cloud: () => team?.fileVersions?.() ?? null }));
    return lines.get(dir);
  };

  /**
   * A file's versions as its line numbers them. Every copy here joins the line
   * first, so new bytes at an old path are the next version and the old ones
   * stay kept. A version is matched to the line by its bytes, or by its name
   * when its bytes are on another computer; a name the line never had (an
   * agent's shorthand, a file only promised) is no version. `same` maps every
   * other id a version went by to the one it is shown under.
   */
  async function lineChain(f) {
    const line = lineNow();
    const shared = audienceOf(f.project) !== 'private';
    const mine = [];
    for (const v of f.chain) {
      const src = await openedOf(f, v);
      const entry = src ? await line.add({ file: f.key, src, name: v.name, by: v.by ?? null, at: v.at || Date.now(), shared }) : null;
      mine.push({ v, src, entry });
    }
    const fallback = familyName({ versions: f.chain }, f.chain.at(-1));
    const chain = [];
    const same = new Map();
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
        ...(first?.edited ? { edited: true } : {}),
        copies: held.flatMap((m) => m.v.copies).concat(first ? [] : overwritten?.copies ?? []),
        opened: held.find((m) => m.src && m.entry?.hash === e.hash)?.src ?? e.kept ?? null,
        ...(e.pending ? { pending: true } : {}),
      });
    }
    // A group's file not fetched yet is in the cloud's keeping: a version still to be numbered.
    const waiting = mine.filter((m) => !m.entry && !chain.some((v) => v.id === m.v.id || same.has(m.v.id)) && m.v.copies.some((c) => c.thread.ref.kind === 'room'));
    for (const { v } of waiting) chain.push({ ...v, n: chain.length + 1, opened: null, pending: true });
    for (const v of chain) same.set(`${baseName(v.name)}@${v.n}`, v.id);
    return { chain, same };
  }
  const asOf = (row, chain) => {
    const newest = chain[chain.length - 1];
    if (!newest) return { ...row, versions: 0, chain };
    const { agent: _agent, ...rest } = row;
    return {
      ...rest,
      name: copyTitle(familyName({ versions: chain }, newest), chain),
      versions: chain.length, at: newest.at || 0, by: newest.by ?? null,
      ...(typeof newest.agent === 'string' ? { agent: newest.agent } : {}),
      approvedBy: [...new Set(row.approvals.filter((a) => a.file === newest.id).map((a) => a.by))],
      chain,
    };
  };

  // A tile draws the newest version this computer has rather than nothing.
  async function faceOf(f) {
    for (const v of [...f.chain].reverse()) {
      const found = v.opened ?? await openedOf(f, v);
      if (found) return found;
    }
    return null;
  }

  // Kept while the file is unchanged, so a film is read once, not on every look.
  const hashes = new Map();
  async function bytesOf(file) {
    const st = await fs.promises.stat(file).catch(() => null);
    if (!st?.isFile()) return null;
    const was = hashes.get(file);
    if (was && was.size === st.size && was.mtime === st.mtimeMs) return was;
    const hash = await new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    });
    const out = { size: st.size, mtime: st.mtimeMs, hash };
    hashes.set(file, out);
    return out;
  }

  async function writeTo(thread, mark) {
    if (thread.ref.kind === 'shared') await team.markSharedFile(thread.ref.ownerId, thread.ref.threadId, mark);
    else if (thread.ref.kind === 'room') await team.rooms.markFile(thread.ref.roomId, mark);
    else store.fileMark(thread.ref.product, thread.ref.id, mark);
  }

  return {
    async list() {
      crossSoon();
      const files = allFiles();
      const lib = shelf();
      const placed = [...lib.places.values()].filter((p) => p.folder);
      const threadOf = (ref) => `${ref.ownerId ?? ref.product}/${ref.threadId ?? ref.id}`;
      const onThreads = (f) => f.sentIn.filter((s) => s.kind === 'thread' || s.kind === 'shared').map(threadOf);
      // Where a thread's files were put, so its next one lands beside them. Only
      // a file made since: tidying one of a thread's files must not move the rest.
      const homes = new Map();
      for (const f of files) {
        const folder = lib.placeOf(f.key);
        if (!folder) continue;
        const since = lib.places.get(f.key)?.at ?? 0;
        for (const t of onThreads(f)) homes.set(t, [...(homes.get(t) ?? []), { folder, since }]);
      }
      const homeOf = (f) => {
        if (!f.project || lib.places.has(f.key)) return null;
        const here = onThreads(f).flatMap((t) => homes.get(t) ?? []);
        const found = new Set(here.map((h) => h.folder));
        return found.size === 1 && here.every((h) => f.at > h.since) ? here[0].folder : null;
      };
      const lined = [];
      for (const whole of files) {
        const { chain } = await lineChain(whole);
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
        return { ...row, project: shownIn, folder: own ?? beside, ...(beside ? { folderFollows: true } : {}), opened: await faceOf(f) };
      })).then((all) => all.filter((f) => f.opened || (f.kind !== 'page' && f.kind !== 'code')));
      const projects = [];
      for (const name of [...rows.map((f) => f.project), ...lib.folders.map((f) => f.project)]) {
        if (name && !projects.some((p) => projectKey(p) === projectKey(name))) projects.push(name);
      }
      return { files: rows, projects: projects.sort((a, b) => a.localeCompare(b)), folders: lib.folders };
    },

    crossing,

    async makeFolder({ project, name, parent = null, by = team?.state?.().me?.id ?? null }) {
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

    async renameFolder({ id, name, by = team?.state?.().me?.id ?? null }) {
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
    async moveFile({ key, folder = null, by = team?.state?.().me?.id ?? null }) {
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

    /** Files named on a thread, into a project's folder by that name, made if it is not there. */
    async fileIn({ project, names, folder, by = team?.state?.().me?.id ?? null }) {
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
    async edit(key, text) {
      const refuse = (error) => ({ ok: false, error: `${error} Nothing was saved. Your words are still here.` });
      const file = find(key);
      if (!file) return refuse('That file is gone.');
      if (file.kind !== 'markdown') return refuse('Only documents can be edited here.');
      if (typeof text !== 'string' || !text.trim()) return refuse('There are no words to save.');
      const thread = whereEditsGo(file.chain);
      const base = thread && threadFiles(filesInLines(thread.lines)).find((f) => f.key === familyIn(file.key))?.versions.at(-1);
      if (!base) return refuse('No thread holds that file now.');
      try {
        if (thread.ref.kind === 'shared') {
          if (new TextEncoder().encode(text).length > MAX_EDIT_BYTES) return refuse('This document is too long to send from here. Whoever made it can edit it on their own thread.');
          await team.markSharedFile(thread.ref.ownerId, thread.ref.threadId, { do: 'edit', file: base.id, text });
          return { ok: true, goes: 'sent', to: thread.ref.ownerId };
        }
        if (thread.ref.kind === 'room') {
          const stored = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.-]+/g, '-')}`;
          const put = await team.rooms.putFile(thread.ref.roomId, { name: stored, dataBase64: Buffer.from(text).toString('base64') });
          if (put?.ok === false) return refuse(put.error ?? 'The group would not take it.');
          await team.rooms.send(thread.ref.roomId, editedWords(file.name, `attachments/${stored}`), { inReplyTo: null, mentions: [] });
          return { ok: true };
        }
        const saved = this.editOnThread({ product: thread.ref.product, id: thread.ref.id, baseId: base.id, text, taken: file.chain.map((v) => v.name) });
        return saved.ok ? saved : refuse(saved.error);
      } catch (err) {
        return refuse(String(err?.message ?? err));
      }
    },

    /** A version written on one of this person's own threads. A chat carries it as a message, which is what reaches the other person. */
    editOnThread({ product, id, path: basePath, baseId, text, taken, since }) {
      const here = store.listProducts().find((p) => p.slug === product);
      if (!here || !store.readItem(product, id)) return { ok: false, error: 'that thread is gone' };
      const lines = store.readHistory(product, id, { max: Number.MAX_SAFE_INTEGER });
      const clean = String(basePath ?? '').replace(/^\.\//, '');
      const names = taken ?? allFiles().find((f) => f.chain.some((v) => v.copies.some((c) => c.thread.ref.id === id && c.path === clean)))?.chain.map((v) => v.name) ?? [];
      const saved = saveNextVersion({ dir: here.dir, threadId: id, lines, basePath, baseId, text, since, taken: names });
      if (!saved.ok) return saved;
      if (here.team?.direct) store.answerItem(product, id, { answer: editedWords(saved.shown, saved.path) });
      else store.fileMark(product, id, { do: 'edit', file: saved.file, path: saved.path, ...(saved.over ? { over: saved.over } : {}) });
      return { ok: true, path: saved.path };
    },

    /**
     * A picture a document names that no path finds: the file in Files of that
     * family, at the version of that name, or else at the version its -vN says.
     */
    async pictureNamed(src) {
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

    async open(key) {
      const whole = find(key);
      if (!whole) return null;
      const { chain, same } = await lineChain(whole);
      if (!chain.length) return null;
      const file = { ...asOf(whole, chain), notes: whole.notes.map((n) => (same.has(n.file) ? { ...n, file: same.get(n.file) } : n)) };
      const opened = new Map();
      for (const v of file.chain) opened.set(v.id, v.opened ?? await openedOf(file, v, { fetch: true }) ?? v.copies[0]?.path ?? v.name);
      return viewOf(file, opened);
    },

    /**
     * Each file a thread names, as its line numbers it: every version, where it
     * opens on this computer (null when only a teammate has it), and `here`, the
     * paths this thread named it by.
     */
    async lineFor({ product, id }) {
      const isHere = (t) => t.ref.kind === 'thread' && t.ref.product === product && t.ref.id === id;
      const out = [];
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
    async sameFile({ product, id, path: src, file: here }, files = allFiles()) {
      const none = { key: null, notes: [], approvals: [] };
      const isHere = (t) => t.ref.kind !== 'shared' && t.ref.product === product && t.ref.id === id;
      const home = files.find((f) => f.chain.some((v) => v.copies.some((c) => isHere(c.thread) && c.path === src)));
      const mine = await onDisk(src, product, null, copiesNow(files).products);
      const me = mine && await bytesOf(mine);
      if (!home || !me) return none;
      const notes = [];
      const approvals = [];
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
    async sameFiles({ product, id, copies }) {
      const files = allFiles();
      return Promise.all((copies ?? []).map((c) => this.sameFile({ product, id, path: String(c?.path ?? ''), file: String(c?.file ?? '') }, files)));
    },

    /** A comment, approval or "seen" from the big view, written where it belongs. */
    async mark(key, mark) {
      const file = find(key);
      if (!file || !mark || typeof mark !== 'object') return { ok: false, error: 'that file is gone' };
      try {
        if (mark.do === 'resolve' || mark.do === 'reopen' || mark.do === 'reply') {
          const n = file.notes.find((x) => x.id === mark.on);
          if (!n) return { ok: false, error: 'that comment is gone' };
          await writeTo(n.thread, mark);
        } else if (mark.do === 'seen') {
          const by = new Map();
          for (const id of mark.on ?? []) {
            const hit = file.notes.find((x) => x.id === id)?.thread ?? file.approvals.find((a) => approvalId(a) === id)?.thread;
            if (hit) by.set(hit, [...(by.get(hit) ?? []), id]);
          }
          for (const [thread, on] of by) await writeTo(thread, { do: 'seen', on });
        } else if (mark.do === 'toagent') {
          const n = file.notes.find((x) => x.id === mark.on?.[0]);
          if (!n) return { ok: false, error: 'that comment is gone' };
          await writeTo(n.thread, { do: 'toagent', on: [n.id] });
          if (n.thread.ref.kind !== 'shared' && n.thread.ref.kind !== 'room') return { ok: true, wrote: { product: n.thread.ref.product, id: n.thread.ref.id } };
        } else if (mark.do === 'note' || mark.do === 'approve' || mark.do === 'unapprove') {
          const { chain } = await lineChain(file);
          const v = chain.find((x) => x.id === mark.file);
          if (!v) return { ok: false, error: 'that version is gone' };
          // Taking an approval back is done where it was given.
          const given = mark.do === 'unapprove' ? file.approvals.find((a) => a.file === v.id && a.by === (team?.state?.().me?.id ?? null)) : null;
          // A version only a teammate has is marked where the file's newest was said.
          const thread = given?.thread ?? v.copies[0]?.thread ?? file.chain.at(-1).copies[0].thread;
          await writeTo(thread, mark);
          if (mark.do === 'note' && thread.ref.kind !== 'shared' && thread.ref.kind !== 'room') return { ok: true, wrote: { product: thread.ref.product, id: thread.ref.id } };
        } else return { ok: false, error: 'that cannot be done here' };
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err?.message ?? err) };
      }
    },
  };
}

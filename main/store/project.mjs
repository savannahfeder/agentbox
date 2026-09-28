// Project store: <store root>/<product>/ is the truth. Single writer (the main
// process). All JSON writes are atomic (tmp + rename); index.json spares
// directory walks; names are sanitized with collision handling.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { SCHEMA_VERSION, validateCreation, creationText, TEXT_CREATION_KINDS } from '../../shared/contracts.mjs';
import { assertInside, assertCreationDir, deniesGitOrEnvPath } from './paths.mjs';
import { migrateIndex } from './migrate.mjs';
import { withProjectLockSync } from './project-lock.mjs';
import { Name, readEnv } from '../../shared/product-name.mjs';

// The machine-wide root: ASTRAL_HOME, else the folder named below. This is
// where device-local files live (settings.json, ui-state.json, usage.json,
// .runtime-pids, ...) and where a founder's PRE-account projects sit until they
// are migrated into an account space. It is NEVER account-scoped: those files
// stay global (Phase 1).
//
// THE FALLBACK IS THE APP'S OWN NAME NOW, where it used to be an older
// product's folder.
//
// NOTHING WAS DELETED AND NOTHING MOVED. That folder is still on disk exactly
// as it was. What changed is that this app stops reaching for it by default.
// Her live store is named in zero.config.json and handed to every worker as
// the app's own home variable, so this line was never the path she runs on; it
// was only ever
// the answer for an install carrying no config at all.
//
// An older product's HOME env var used to sit between these two. It is gone:
// nothing sets it any more now that the store server carries the app's own name.
export function legacyRoot() {
  return readEnv('HOME') || path.join(os.homedir(), Name);
}

// The account currently signed in, if any. Set once at boot and re-resolved on
// every auth change (main/ipc.mjs), so dataRoot answers per-account without
// every caller having to thread a userId through. One account is active per
// running app at a time; switching accounts re-inits (see the account-scoped
// persistence spec).
let currentAccountId = null;

// A user id sanitized to a safe single path segment (Supabase ids are UUIDs;
// this is belt-and-braces so a hostile/odd id can never escape accounts/).
function sanitizeAccountId(userId) {
  return String(userId ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '').slice(0, 64) || 'account';
}

export function accountRootFor(userId) {
  return path.join(legacyRoot(), 'accounts', sanitizeAccountId(userId));
}

// Enter an account's data space. All later dataRoot answers resolve here.
export function setAccountScope(userId) {
  currentAccountId = userId ? sanitizeAccountId(userId) : null;
  return dataRoot();
}

// Leave the account space (sign-out). Signed out is DEV-ONLY (packaged builds
// always gate), and resolves back to the legacy root, exactly the pre-account
// behavior, so the founder's dev workflow is unchanged.
export function clearAccountScope() {
  currentAccountId = null;
}

export function getAccountId() {
  return currentAccountId;
}

// The active PROJECT data root. Account-aware: signed in as user X it is
// <legacyRoot>/accounts/<X>; signed out (dev only) it is the legacy root
// itself. Machine-wide files deliberately use legacyRoot instead, so they
// stay global across accounts.
export function dataRoot() {
  const base = legacyRoot();
  return currentAccountId ? path.join(base, 'accounts', currentAccountId) : base;
}

export function sanitizeName(name) {
  const slug = String(name ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return slug || 'untitled';
}

export function atomicWriteJson(file, obj) {
  const tmp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function emptyIndex() {
  return { schemaVersion: SCHEMA_VERSION, creations: [], runs: [], reports: [], updatedAt: null };
}

// Read index.json, migrating a v1 shape to v2 on the way in. The migrated
// result is written back only when it actually differs from what was on
// disk, so a project already on v2 never takes a spurious write.
export function readIndex(projectDir) {
  const file = path.join(projectDir, 'index.json');
  const raw = readJson(file, emptyIndex());
  const idx = migrateIndex(raw);
  if (idx !== raw) atomicWriteJson(file, idx);
  return idx;
}

export function createProject(name, root = dataRoot()) {
  fs.mkdirSync(root, { recursive: true });
  let slug = sanitizeName(name);
  let dir = path.join(root, slug);
  for (let n = 2; fs.existsSync(dir); n++) { // collision -> suffix
    slug = `${sanitizeName(name)}-${n}`;
    dir = path.join(root, slug);
  }
  fs.mkdirSync(dir, { recursive: true });
  // `runs` CAME OUT OF THIS LIST. it holds the record of what each run changed,
  // and home.mjs carries it to the app's home. Making it here put an empty
  // folder of our machinery into every brand-new product, which is the thing a
  // new user watched happen and asked us not to do. The rest of this list is
  // hers.
  for (const sub of ['personas', 'transcripts', 'reports', 'designs', 'creations']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
  }
  const project = { schemaVersion: SCHEMA_VERSION, id: slug, name: String(name ?? slug), createdAt: new Date().toISOString() };
  atomicWriteJson(path.join(dir, 'project.json'), project);
  atomicWriteJson(path.join(dir, 'index.json'), emptyIndex());
  return { ...project, dir };
}

// The notes doc a brand-new project opens with. A first-timer reads this, so
// it must be a friendly, clean starting page: NO scaffolding comments. The
// agent keeps the index in shape from its skills; the doc itself stays plain
// prose.
export function starterNotesDoc(name) {
  return `# ${name}\n\nThis is your product's living map. I keep it short and current as we work: the decisions we make, where things stand, and where the real detail lives. Everything we build together shows up beside this.\n\n## Decisions\n\nNothing decided yet.\n\n## Where we are\n\nJust getting started.\n`;
}

export function listProjects(root = dataRoot()) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    // A project may be a symlink into another store root (one physical dir
    // reachable from two roots); a Dirent reports a symlink as
    // not-a-directory, so resolve with stat before filtering.
    .filter((e) => {
      try { return fs.statSync(path.join(root, e.name)).isDirectory(); } catch { return false; }
    })
    .map((e) => {
      const p = readJson(path.join(root, e.name, 'project.json'));
      if (!p) return null;
      const idx = readJson(path.join(root, e.name, 'index.json'), emptyIndex());
      // cloudId and archived ride along because consumers dedupe against them:
      // the app's cloud bootstrap checks `local.cloudId === row.project_id` to
      // decide a registry row is already represented locally. When this list
      // omitted cloudId, that check never matched, and the bootstrap adopted a
      // same-NAME project instead: it stamped a stale duplicate's cloudId onto
      // the real Cascade, and the next sync pull overwrote the real project's
      // identity with the duplicate's (2026-08-04).
      return { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: idx.updatedAt, dir: path.join(root, e.name), cloudId: p.cloudId ?? null, archived: p.archived === true };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)));
}

export function loadProject(id, root = dataRoot()) {
  const dir = path.join(root, sanitizeName(id));
  const p = readJson(path.join(dir, 'project.json'));
  return p ? { ...p, dir } : null;
}

// Read a project by the FOLDER a caller already has, not by re-deriving one from
// an id. loadProject answers "the project in the folder named after this id",
// which is a different question whenever a product's id and its folder have
// drifted apart (two products can even carry the same id, so no id-based lookup
// can tell them apart). Anything that has already resolved a product should keep
// hold of its directory and come back through here.
export function loadProjectAt(dir) {
  const p = readJson(path.join(dir, 'project.json'));
  return p ? { ...p, dir } : null;
}

export function renameProject(id, newName, root = dataRoot()) {
  const name = String(newName ?? '').trim();
  if (!name) return null;
  return patchProject(id, { name }, root);
}

// Delete a product for good: the folder is erased from disk (rm, not Trash).
// Containment is belt-and-braces: the id resolves through sanitizeName to a
// DIRECT child of the data root, and that child must actually be a project
// (project.json present), so a stray id can never point the rm anywhere else.
export function deleteProject(id, root = dataRoot()) {
  const slug = sanitizeName(id);
  const dir = path.join(root, slug);
  if (path.dirname(path.resolve(dir)) !== path.resolve(root)) throw new Error('refusing: path escapes the data root');
  if (!fs.existsSync(path.join(dir, 'project.json'))) throw new Error(`not a product folder: ${slug}`);
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

// Async twin of deleteProject. A product that has ever been built is a git repo
// with a node_modules tree: a synchronous rmSync of it blocks the whole main
// process for seconds (the frozen "stuck on …" delete). fs.promises.rm yields
// to the event loop so the app stays responsive while the folder is erased.
// Same containment guards as the sync version, so a stray id can never point
// the rm outside the data root.
export async function deleteProjectAsync(id, root = dataRoot()) {
  const slug = sanitizeName(id);
  const dir = path.join(root, slug);
  if (path.dirname(path.resolve(dir)) !== path.resolve(root)) throw new Error('refusing: path escapes the data root');
  if (!fs.existsSync(path.join(dir, 'project.json'))) throw new Error(`not a product folder: ${slug}`);
  await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
  return true;
}

// Shallow-merge fields into project.json (e.g. lastSessionId for resume).
export function patchProject(id, patch, root = dataRoot()) {
  const p = loadProject(id, root);
  if (!p) return null;
  return patchProjectAt(p.dir, patch);
}

// The same write, aimed at a folder a caller already resolved. This is the safe
// one: a write that re-derives its folder from an id lands wherever that id
// happens to name, which is not always the product the caller looked up.
export function patchProjectAt(dir, patch) {
  const p = loadProjectAt(dir);
  if (!p) return null;
  atomicWriteJson(path.join(dir, 'project.json'), { ...p, dir: undefined, ...patch });
  return { ...p, ...patch };
}

// The ONE place index.json is read, mutated, and written back, which makes it
// the one place that has to be safe against other PROCESSES.
//
// runForProject (main/store/queues.mjs) serializes this within a single process
// and always did. That was the whole world when the app's main process was the
// only writer. It is not any more: the MCP server (mcp/) runs as many concurrent
// children against this same directory, and an in-process promise chain tells
// them nothing about each other. Two processes both read revision N, both write,
// and one of them silently loses a document from the catalog.
//
// So the read-mutate-write happens under a cross-process file lock. It is taken
// HERE, precisely, rather than around runForProject: several of that queue's
// bodies are git pushes and other network work, and holding a lock with a
// 30-second staleness timer across a slow push would get it broken mid-flight,
// which is worse than not locking at all. This section is a read, a mutate, and
// a rename, so it is over in about a millisecond.
export function updateIndex(projectDir, mutate) {
  return withProjectLockSync(projectDir, () => {
    const file = path.join(projectDir, 'index.json');
    const idx = readIndex(projectDir);
    mutate(idx);
    idx.updatedAt = new Date().toISOString();
    atomicWriteJson(file, idx);
    return idx;
  }, { label: 'updateIndex' });
}

/* --------------------------------- chat --------------------------------- */
export function appendChat(projectDir, message) {
  fs.appendFileSync(path.join(projectDir, 'chat.jsonl'), JSON.stringify(message) + '\n');
}

// The log is append-only; a message is UPDATED by appending a line with the
// same id (asks do this when answered). Reading folds duplicates: last line
// wins, the message keeps its original position in the conversation.
export function readChat(projectDir) {
  let lines;
  try {
    lines = fs.readFileSync(path.join(projectDir, 'chat.jsonl'), 'utf8').split('\n').filter(Boolean);
  } catch { return []; }
  const order = []; const byId = new Map();
  for (const l of lines) {
    let m; try { m = JSON.parse(l); } catch { continue; } // torn tail line: skip
    if (!m?.id) continue;
    if (!byId.has(m.id)) order.push(m.id);
    byId.set(m.id, { ...(byId.get(m.id) ?? {}), ...m });
  }
  return order.map((id) => byId.get(id));
}

/* ------------------------------- creations ------------------------------- */
// Envelope in index.json; content in the file at envelope.path (project-relative)
// for a single-file creation, or under envelope.dir (a git-backed folder,
// see main/creations/materialize.mjs) for a folder-backed one.
export function saveCreation(projectDir, envelope, content) {
  // Validate at the sink, not on trust: every catalog writer routes through
  // here, so a malformed envelope (an unregistered kind, path and dir both
  // set) is refused before it can land in index.json. The phantom kind 'doc'
  // lived for a week because nothing enforced the registry at save time.
  const problems = validateCreation(envelope);
  if (problems.length) throw new Error(`saveCreation: invalid envelope: ${problems.join('; ')}`);
  if (envelope.dir) {
    // Folder-backed: the file itself is written by materializeCreation /
    // writeCreationFile, which also commit it. This call only updates the
    // catalog entry; there is no single path to put `content`, so a caller
    // passing real content (instead of null) is a bug in that caller, not
    // silently dropped data.
    if (content != null) {
      throw new Error('saveCreation: content is ignored for a folder-backed creation (dir set); write files via materializeCreation/writeCreationFile instead');
    }
    // A folder-backed envelope's `dir` must be a real subdirectory of
    // creations/ (assertCreationDir, main/store/paths.mjs): plain containment
    // would happily accept "creations" itself, a run directory, or the
    // project root, and every later read/list/write/delete on this envelope
    // trusts `dir` as the creation's root. Reject anything else, and do it
    // BEFORE the catalog write so a bad envelope (e.g. from a compromised
    // sync peer) never lands in index.json at all.
    const absDir = assertCreationDir(projectDir, envelope.dir);
    updateIndex(projectDir, (idx) => {
      idx.creations = idx.creations.filter((c) => c.id !== envelope.id);
      idx.creations.push({ ...envelope, schemaVersion: envelope.schemaVersion ?? SCHEMA_VERSION });
    });
    return absDir;
  }
  const rel = envelope.path;
  if (!rel) throw new Error(`unsafe creation path: ${rel}`);
  // Deny at the SINK, not just in the tool arg branch: a single-file envelope
  // pointing at .git/.env (a compromised sync peer, or a legacy pre-deny
  // envelope) must never write a secret path here, no matter which caller
  // reached us. Folder-backed envelopes (dir set) take the branch above and are
  // denied at their own file IO in materialize.mjs.
  if (deniesGitOrEnvPath(rel)) throw new Error(`refusing to write a .git/.env creation path: ${rel}`);
  const file = assertInside(projectDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A TEXT KIND REACHES DISK AS TEXT, whatever the caller handed us. Writing an
  // editor's JSON tree here instead is invisible at the time and shows up as a
  // blank panel beside a chat saying the document is open: the viewer tests for
  // a string, an object fails it, and nothing downstream has a branch for that
  // shape. Coerced rather than refused, because the founder's words matter more
  // than the caller's mistake and throwing here would lose them.
  // ...but only where the file itself is text. A text KIND can still hold a
  // structured document when its path says so (a markdown creation pointed at
  // a .json file is an existing, deliberate path), and the envelope's own
  // extension is the declaration rather than something to infer.
  const wantsText = content != null
    && TEXT_CREATION_KINDS.includes(envelope.kind)
    && !/\.json$/i.test(rel);
  const body = wantsText ? creationText(content) : content;
  if (typeof body === 'string') {
    const tmp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
  } else if (body != null) {
    atomicWriteJson(file, body);
  }
  updateIndex(projectDir, (idx) => {
    idx.creations = idx.creations.filter((c) => c.id !== envelope.id);
    idx.creations.push({ ...envelope, schemaVersion: envelope.schemaVersion ?? SCHEMA_VERSION });
  });
  return file;
}

// Company V1: mark a creation as history (kept forever, hidden from default
// reading, one click away for the founder) or bring it back to current. `status`
// and `replacedBy` are OPTIONAL, ADDITIVE envelope metadata: an envelope without
// them reads as current, so every existing index.json keeps working untouched
// and an existing user sees zero behavior change. Both fields spread straight
// through saveCreation/migrateIndex (whole-envelope copies), so no validator or
// schemaVersion change is needed.
//
// CRITICAL SYNC RULE: the write stamps `updatedAt` (NOT `ts`, which is creation
// time and must not move). The sync merge (main/store/sync.mjs mergeRegistry)
// picks the newer whole entry by `stamp = Date.parse(updatedAt) || ts`, so a
// status change MUST carry a parseable-newer updatedAt or a stale envelope from
// another machine would silently overwrite it. `stamp` runs Date.parse on
// updatedAt, so it must be an ISO 8601 STRING (a numeric Date.now parses to NaN
// and would fall back to the old `ts`, losing the merge) -> new
// Date.toISOString. Clearing back to current DELETES the keys (rather than
// storing status:'current'), so a reverted creation is byte-identical to one
// that never had the fields. The three states a piece of work can be in.
// `current` is the absence of a status (the default, so nothing needs
// migrating), and the two named ones are both "do not read this as the live
// answer", for opposite reasons:
//
//   history      superseded. Something replaced it, and replacedBy says what.
//   exploration  never adopted. An afternoon of playing around that fizzled
//                without a verdict. Added 2026-07-25 after a round of throwaway
//                landing-page designs kept their default authority for a day
//                and got promoted to "(live answer)" in the index, which then
//                outranked a live web fetch the agent performed itself and
//                produced a go-to-market plan built on a page that was never
//                real. Binary status was the hole: work that fizzles has no
//                winner to point at, so history is the wrong word for it, and
//                the burden of demoting it fell on a founder who had already
//                moved on and had no reason to think about it again.
export const CREATION_STATUSES = ['current', 'history', 'exploration'];

export function setCreationStatus(projectDir, id, { status, replacedBy } = {}) {
  const idx = readIndex(projectDir);
  const envelope = (idx.creations ?? []).find((c) => c.id === id && !c.deleted);
  if (!envelope) throw new Error(`no such creation: ${id}`);
  const next = { ...envelope, updatedAt: new Date().toISOString() };
  if (status === 'history' || status === 'exploration') {
    next.status = status;
    const note = typeof replacedBy === 'string' ? replacedBy.trim() : '';
    if (note) next.replacedBy = note; else delete next.replacedBy;
  } else {
    delete next.status;
    delete next.replacedBy;
  }
  saveCreation(projectDir, next, null);
  return next;
}

// Tombstone delete: the catalog entry is REPLACED, not removed, with
// { id, deleted: true, ts } so sync and any open tab can tell "gone" from
// "never existed". The backing file is unlinked (containment-checked); a
// folder-backed creation's `dir` is removed recursively. A directory-shaped
// `path` (e.g. a live run) is left on disk, only the catalog entry tombstones.
// Returns the removed envelope, or null if there was no such creation.
export function deleteCreation(projectDir, id) {
  const idx = readIndex(projectDir);
  const envelope = (idx.creations ?? []).find((c) => c.id === id);
  if (!envelope) return null;
  const rel = envelope.path;
  if (rel) {
    try {
      const file = assertInside(projectDir, rel);
      // only unlink a real FILE inside the project (never a run directory)
      if (fs.statSync(file).isFile()) fs.unlinkSync(file);
    } catch { /* already gone, unsafe, or a dir: leave it */ }
  }
  if (envelope.dir) {
    // assertCreationDir (not plain assertInside): a tampered/stale envelope
    // with dir: "." or dir: "runs/x" must never turn this into an rm -rf of
    // the project root or some unrelated subtree. Only an UNSAFE dir is
    // swallowed here (disk left alone, catalog still tombstones below); a
    // real removal failure on a legitimately-scoped dir is a genuine error
    // and must surface, not silently report success.
    let abs = null;
    try { abs = assertCreationDir(projectDir, envelope.dir); } catch { /* unsafe dir: leave disk alone */ }
    if (abs) fs.rmSync(abs, { recursive: true, force: true });
  }
  updateIndex(projectDir, (i) => {
    i.creations = (i.creations ?? []).map((c) => (c.id === id ? { id, deleted: true, ts: Date.now() } : c));
  });
  // A deleted creation must not leave the project's product pointer dangling:
  // build sessions resolve productCreationId to a cwd, and a pointer at a
  // tombstone once sent every product-path build into a nonexistent directory
  // (spawn ENOENT, misreported by the SDK as a libc problem). Clearing it here
  // covers every deletion caller.
  const projFile = path.join(projectDir, 'project.json');
  const proj = readJson(projFile);
  if (proj?.productCreationId === id) {
    atomicWriteJson(projFile, { ...proj, productCreationId: null });
  }
  return envelope;
}

export function readCreationContent(projectDir, envelope) {
  const rel = envelope.path;
  if (!rel) throw new Error(`unsafe creation path: ${rel}`);
  // A kind 'file' creation is raw bytes (video, audio, an arbitrary asset);
  // reading it as utf8 would hand back garbage. Its viewer streams the bytes
  // through creation-file:// instead; content is null by design.
  if (envelope.kind === 'file') return null;
  // Deny at the SINK: this covers ALL callers, including read_creation({id})
  // and the IPC openProject snapshot map, which read the CATALOGED
  // envelope.path and never pass through the tool-level args.path check. A
  // tampered/legacy single-file envelope pointing at .env / .git/config must
  // throw here so it cannot leak; the openProject map try/catches this into a
  // null-content (empty) tab.
  if (deniesGitOrEnvPath(rel)) throw new Error(`refusing to read a .git/.env creation path: ${rel}`);
  const file = assertInside(projectDir, rel);
  const raw = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(raw); } catch { return raw; }
}

// is a claim about the founder's SCREEN, and the tab strip used to be renderer
// state only: an artifact opened while nobody was listening (the web bridge
// reconnecting, a background chat finishing after a reload, the founder on
// another project) reached no client and was never written down, so the
// sentence was true when the tool ran and false when she read it. Recording the
// open here makes it durable.
//
// Append-only and idempotent on purpose. It never reorders, never closes, and
// never touches activeTab: an artifact opening while she reads something else
// must not yank her away. The live creation.opened event still focuses the tab
// for a founder who IS watching, and her own saveView still wins afterwards
// (closing a tab is her call, and last write wins). Returns the tab list.
export function noteOpenedTab(projectDir, creationId) {
  if (!projectDir || typeof creationId !== 'string' || !creationId) return null;
  const file = path.join(projectDir, 'view.json');
  const view = readJson(file, null) ?? { openTabs: [], activeTab: null, pinnedTabs: [], browsers: [] };
  const openTabs = Array.isArray(view.openTabs) ? view.openTabs : [];
  if (openTabs.includes(creationId)) return openTabs;
  const next = [...openTabs, creationId].slice(-200);
  atomicWriteJson(file, { ...view, openTabs: next });
  return next;
}

// The project:open creations map, with LAZY bodies. Shipping every creation's
// full content made opening a big project a multi-second stall (one giant
// frame over the web socket), so content rides along only for tabs that are
// actually open plus small docs (library excerpts stay populated). The
// renderer hydrates anything else through IPC.creationContent on tab open.
export const SNAPSHOT_SMALL_CONTENT_BYTES = 16 * 1024;
export function snapshotCreations(projectDir, openIds = new Set()) {
  const live = (readIndex(projectDir).creations ?? []).filter((c) => !c.deleted);
  return live.map((envelope) => {
    // a live-run's path is a run DIRECTORY, not a content file: it has no body
    // to read (the tab rebuilds its last still from meta), so skip the read
    // rather than lean on a directory read throwing.
    if (envelope.kind === 'live-run') return { envelope, content: null };
    let content = null;
    try {
      // readCreationContent enforces containment and the .git/.env deny; a
      // tampered index.json yields a null-content tab, never file contents.
      content = readCreationContent(projectDir, envelope) ?? null;
    } catch { /* unsafe path or unreadable; renderer shows the tab empty */ }
    if (content != null && !openIds.has(envelope.id)) {
      const size = typeof content === 'string' ? content.length : JSON.stringify(content).length;
      if (size > SNAPSHOT_SMALL_CONTENT_BYTES) content = null;
    }
    return { envelope, content };
  });
}

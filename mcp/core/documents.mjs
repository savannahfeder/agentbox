// Documents: everything the store holds that is not code.
//
// Three functions cover the ICP, personas, transcripts, findings, reports,
// notes, and designs, because on disk all of them already ARE the same thing: a
// file at a path with an envelope in index.json. A read_persona / read_report /
// read_transcript surface would be three more things to maintain that a path
// already distinguishes, and it would need a fourth the first time the founder
// invents a kind of document nobody anticipated.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readIndex, readCreationContent, saveCreation, setCreationStatus, CREATION_STATUSES } from '../../main/store/project.mjs';
import { runForProject } from '../../main/store/queues.mjs';
import { assertInside, deniesGitOrEnvPath } from '../../main/store/paths.mjs';
import { AGENT_CREATION_KINDS, SCHEMA_VERSION } from '../../shared/contracts.mjs';
import { libraryFolderOf } from '../../shared/library-folder.mjs';
import { resolveProduct } from './account.mjs';

const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

// NOT EVERY DOCUMENT IS IN THE CATALOG, and pretending otherwise is the fastest
// way to make this server lie. The `onboard` product on disk right now has eight
// persona files and exactly one catalog entry: skills write files directly, sync
// brings files in, and the founder edits by hand. A reader that consulted only
// index.json would report that seven of her personas do not exist, which is
// worse than useless, because it reads as an authoritative answer.
//
// So the catalog is treated as what it is, an INDEX OVER the files rather than
// the set of them, and the disk is walked alongside it. The walk is narrow on
// purpose: prose only, and never into the directories that hold code, run
// artifacts, or the store's own bookkeeping, which are large, uninteresting to a
// reader, and served by better tools elsewhere.
const READABLE_EXT = new Set(['.md', '.html', '.txt', '.csv']);
const SKIP_DIRS = new Set([
  'creations', 'runs', 'workspace', 'records', 'chats', 'databases', 'deployments',
  'node_modules', '.git', 'dist', 'build', '.next',
]);
const MAX_WALK_ENTRIES = 2000;

function walkFiles(root) {
  const out = [];
  const stack = [''];
  while (stack.length && out.length < MAX_WALK_ENTRIES) {
    const rel = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(childRel);
        continue;
      }
      if (!e.isFile() || !READABLE_EXT.has(path.extname(e.name).toLowerCase())) continue;
      out.push(childRel);
    }
  }
  return out;
}

// What a path implies about how it should be read. One rule, used both for
// files found on disk and for documents written through this server, so the two
// can never disagree about the same filename.
function kindForPath(rel) {
  return /\.html?$/i.test(rel || '') ? 'design' : 'markdown';
}

function fileView(root, rel) {
  let updatedAt = null;
  try { updatedAt = new Date(fs.statSync(path.join(root, rel)).mtimeMs).toISOString(); } catch { /* raced a delete */ }
  return {
    id: null,
    title: path.basename(rel, path.extname(rel)),
    kind: kindForPath(rel),
    path: rel,
    dir: null,
    folder: rel.includes('/') ? rel.split('/')[0] : null,
    status: 'current',
    replacedBy: null,
    updatedAt,
    cataloged: false,
  };
}

function envelopeView(c) {
  return {
    id: c.id,
    title: c.title,
    kind: c.kind,
    path: c.path ?? null,
    dir: c.dir ?? null,
    folder: libraryFolderOf(c) || null,
    status: c.status ?? 'current',
    replacedBy: c.replacedBy ?? null,
    updatedAt: c.updatedAt ?? (c.ts ? new Date(c.ts).toISOString() : null),
    cataloged: true,
  };
}

/**
 * Everything readable in a product: catalog entries, plus prose files on disk
 * that no catalog entry points at. Never opens a document.
 *
 * A catalog entry always wins over the bare file it describes, since it carries
 * the title and status a person chose.
 */
export function listDocuments(ref, { folder = null, kind = null, status = null, pathPrefix = null, query = null, catalogedOnly = false } = {}) {
  const project = resolveProduct(ref);
  const idx = readIndex(project.dir);
  const wanted = query ? String(query).toLowerCase() : null;

  const cataloged = (idx.creations ?? []).filter((c) => !c.deleted).map(envelopeView);
  const seen = new Set(cataloged.map((c) => c.path).filter(Boolean));

  const loose = catalogedOnly ? [] : walkFiles(project.dir)
    .filter((rel) => !seen.has(rel))
    .map((rel) => fileView(project.dir, rel));

  return [...cataloged, ...loose]
    .filter((c) => (!folder || c.folder === folder)
      && (!kind || c.kind === kind)
      && (!status || c.status === status)
      && (!pathPrefix || (c.path ?? '').startsWith(pathPrefix))
      && (!wanted || c.title.toLowerCase().includes(wanted) || (c.path ?? '').toLowerCase().includes(wanted)))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
}

/** One document, by id or by path. */
export function readDocument(ref, { id = null, path: relPath = null } = {}) {
  const project = resolveProduct(ref);
  if (!id && !relPath) throw new Error('read_document needs either an id or a path');
  const idx = readIndex(project.dir);

  const envelope = (idx.creations ?? []).find((c) => !c.deleted && (id ? c.id === id : c.path === relPath));
  if (!envelope) {
    // An id is a catalog concept, so a miss there is genuinely a miss. A PATH is
    // not: the file may be sitting right there uncataloged (see the note above
    // walkFiles), and refusing to read a file that exists because an index does
    // not mention it would be an obviously wrong answer to an obviously fair
    // question. Containment and the .git/.env deny-list still apply, since they
    // are what make an agent-supplied path safe to open at all.
    if (id) throw new Error(`no document with id ${id} in ${project.name}`);
    if (deniesGitOrEnvPath(relPath)) throw new Error(`refusing to read a .git/.env path: ${relPath}`);
    let content;
    try {
      content = fs.readFileSync(assertInside(project.dir, relPath), 'utf8');
    } catch {
      throw new Error(`no document at path ${relPath} in ${project.name} (list_documents shows what exists)`);
    }
    return { ...fileView(project.dir, relPath), content };
  }
  if (envelope.dir) {
    throw new Error(`"${envelope.title}" is folder-backed, which this server does not serve; its files live at ${path.join(project.dir, envelope.dir)}`);
  }

  return { ...envelopeView(envelope), content: readCreationContent(project.dir, envelope) };
}

/**
 * Create, update, retitle, move, or restatus a document.
 *
 * One function rather than five, and content is OPTIONAL: omitting it means a
 * metadata-only change, which is how a rename or a status change happens without
 * having to read a document back and write it out unchanged (the version of that
 * which loses a document to a race is exactly the thing this whole design is
 * trying to stop happening).
 */
export async function writeDocument(ref, { id = null, path: relPath = null, title = null, kind = null, content = null, status = null } = {}) {
  const project = resolveProduct(ref);

  return runForProject(project.id, async () => {
    const idx = readIndex(project.dir);
    const existing = id
      ? (idx.creations ?? []).find((c) => !c.deleted && c.id === id)
      : (idx.creations ?? []).find((c) => !c.deleted && c.path === relPath);

    if (id && !existing) throw new Error(`no document with id ${id} in ${project.name}`);
    if (existing?.dir) throw new Error(`"${existing.title}" is folder-backed; this server does not write into folder-backed artifacts`);

    const nextPath = relPath ?? existing?.path;
    if (!nextPath) throw new Error('a new document needs a path, e.g. "reports/first-run.md" or "personas/marcus.md"');
    if (deniesGitOrEnvPath(nextPath)) throw new Error(`refusing to write a .git/.env path: ${nextPath}`);

    // THE PATH ALREADY SAYS WHAT THIS IS, so a caller that did not name a kind
    // gets the one its extension implies rather than a blanket 'markdown'. Two
    // real failures made this worth deriving:
    //
    // A document written to a .html path and catalogued as markdown renders as
    // escaped source, because the app decides by kind (`kind === 'design' ||
    // kind === 'canvas'`), so the founder who asked for html got a page of
    // literal tags. That punished obeying her, which is the worst kind of trap:
    // the rule looks followed and the result is worse than ignoring it.
    //
    // And the old signature default meant kind was NEVER absent, so the
    // `existing?.kind` fallback below could not fire: renaming a persona or a
    // transcript silently demoted it to markdown.
    //
    // Uncataloged files on disk are already read this way (fileView above), so
    // this makes a written document and a found one agree.
    const nextKind = kind ?? existing?.kind ?? kindForPath(nextPath);
    if (!AGENT_CREATION_KINDS.includes(nextKind)) {
      throw new Error(`kind must be one of ${AGENT_CREATION_KINDS.join(', ')} (got "${nextKind}")`);
    }
    const nextTitle = title ?? existing?.title;
    if (!nextTitle) throw new Error('a new document needs a title');

    if (content != null) {
      if (typeof content !== 'string') throw new Error('content must be a string');
      const bytes = Buffer.byteLength(content, 'utf8');
      if (bytes > MAX_CONTENT_BYTES) throw new Error(`document is ${bytes} bytes (max ${MAX_CONTENT_BYTES})`);
    }
    // A metadata-only write on a document that does not exist yet would create a
    // catalog entry pointing at nothing, which reads as a document until someone
    // opens it. Refuse instead.
    if (content == null && !existing) throw new Error('a new document needs content');

    const envelope = {
      ...(existing ?? {}),
      id: existing?.id ?? `a-${crypto.randomBytes(4).toString('hex')}`,
      kind: nextKind,
      title: nextTitle,
      path: nextPath,
      ts: existing?.ts ?? Date.now(),
      updatedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
    };
    // A move is a path change; the old file is deliberately left where it is
    // rather than deleted, because losing a document to a typo'd move is a worse
    // outcome than an orphan file the founder can see and remove.
    const moved = existing && existing.path !== nextPath;

    saveCreation(project.dir, envelope, content);
    if (status && CREATION_STATUSES.includes(status)) setCreationStatus(project.dir, envelope.id, { status });

    return { ...envelopeView(readIndex(project.dir).creations.find((c) => c.id === envelope.id)), created: !existing, moved: moved ? existing.path : null };
  });
}

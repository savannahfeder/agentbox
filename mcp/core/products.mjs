// Products: one per idea the founder is raising. A product is a project
// directory in the store, which is what the app has always called it.
//
// The one genuinely new field here is repoPath. Product CODE lives in an
// ordinary git checkout outside the store, written by the calling agent with
// its own editing tools, so a product record needs to say where. The store
// holds the thinking; the repo holds the software.

import fs from 'node:fs';
import path from 'node:path';
import { listProjects, createProject, loadProjectAt, patchProjectAt, readIndex, readJson, starterNotesDoc, saveCreation } from '../../main/store/project.mjs';
import { readWorkItems } from '../../main/store/work-items.mjs';
import { resolveProduct } from './account.mjs';
import { SCHEMA_VERSION } from '../../shared/contracts.mjs';

// Fields the MCP may set on project.json beyond what the app already writes.
const PRODUCT_FIELDS = ['name', 'oneLiner', 'repoPath', 'archived'];

function describe(project, { now = Date.now() } = {}) {
  const idx = readIndex(project.dir);
  const meta = readJson(path.join(project.dir, 'project.json'), {}) ?? {};
  let work = [];
  try { work = readWorkItems(project.dir, now); } catch { /* a product with no ledger yet */ }

  const live = work.filter((w) => w.status !== 'done');
  return {
    id: project.id,
    name: project.name,
    dir: project.dir,
    oneLiner: meta.oneLiner ?? null,
    repoPath: meta.repoPath ?? null,
    archived: meta.archived === true,
    documents: (idx.creations ?? []).filter((c) => !c.deleted).length,
    workItems: { open: live.filter((w) => w.status === 'open').length, claimed: live.filter((w) => w.status === 'claimed').length, blocked: live.filter((w) => w.status === 'blocked').length },
    createdAt: project.createdAt ?? null,
    updatedAt: project.updatedAt ?? null,
  };
}

/** Every product in one call: the cross-product view. */
export function listProducts({ includeArchived = false, now = Date.now() } = {}) {
  return listProjects()
    .map((p) => describe(p, { now }))
    .filter((p) => includeArchived || !p.archived);
}

export function getProduct(ref, { now = Date.now() } = {}) {
  return describe(resolveProduct(ref), { now });
}

/**
 * Start a new product. Creates the project directory the app already
 * understands, plus the starter notes doc, so a product made from Claude Code is
 * indistinguishable from one made in the app.
 */
export function createProduct(name, { oneLiner = null, repoPath = null } = {}) {
  if (!name || !String(name).trim()) throw new Error('a product needs a name');
  const project = createProject(String(name).trim());

  if (oneLiner || repoPath) patchProjectAt(project.dir, cleanPatch({ oneLiner, repoPath }));

  // The notes doc is the founder's living map, and the app expects one. Written
  // through saveCreation so it lands in the catalog rather than sitting on disk
  // as a file nothing knows about.
  saveCreation(
    project.dir,
    { id: 'a-notes', kind: 'markdown', title: `${project.name} notes`, path: 'notes.md', ts: Date.now(), schemaVersion: SCHEMA_VERSION },
    starterNotesDoc(project.name),
  );

  return describe({ ...project, dir: project.dir });
}

// A write goes to the product the read found. resolveProduct answers by looking
// through the records; deriving the folder again from the resolved id asks a
// DIFFERENT question, and the two answers only agree while every product's id
// matches its own folder name. That invariant is false in the real store: one
// product sits in a folder carrying a DIFFERENT product's id, beside the
// product whose folder really has that id, so every update aimed at the first
// silently edited the second and reported the second's record back as if it
// were the one just changed. Nothing errored. Keeping the resolved directory is
// what makes the read and the write name the same product, and it is the only
// lookup that still works when two products share an id.
export function updateProduct(ref, patch = {}) {
  const project = resolveProduct(ref);
  const clean = cleanPatch(patch);
  if (!Object.keys(clean).length) throw new Error(`nothing to update (recognized fields: ${PRODUCT_FIELDS.join(', ')})`);
  patchProjectAt(project.dir, clean);
  return describe({ ...project, ...loadProjectAt(project.dir) });
}

function cleanPatch(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!PRODUCT_FIELDS.includes(k) || v == null) continue;
    if (k === 'archived') { out.archived = v === true; continue; }
    if (k === 'repoPath') {
      // Stored as given, but checked: a repo path that does not exist is almost
      // always a typo, and finding out later means an agent looking for code in
      // a directory that was never there.
      const p = path.resolve(String(v).replace(/^~/, process.env.HOME ?? '~'));
      if (!fs.existsSync(p)) throw new Error(`no such directory: ${p} (repoPath should point at the product's git checkout)`);
      out.repoPath = p;
      continue;
    }
    const s = String(v).trim();
    if (s) out[k] = s;
  }
  return out;
}

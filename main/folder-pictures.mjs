// THE PICTURES IN A FOLDER A MESSAGE NAMES, newest first.
//
// A worker that drew several versions names their folder on a line of its own,
// and until 2026-10-04 that line was grey text. Focus now draws the pictures
// under it (FolderPreview), and this is the one thing the window cannot do for
// itself: look inside a folder.
//
// Two rules, the same two the picture scheme enforces (./img-scheme.mjs), so a
// folder line is never a way to list anything else: the folder is inside this
// product's own folders or the account root, and only pictures come back. One
// level only, because a design folder keeps old rounds in folders of their own.
// tests/a-named-folder-shows-its-pictures.test.mjs holds every edge.
import fsDefault from 'node:fs';
import path from 'node:path';
import { resolveArtifact } from './artifact-path.mjs';
import { servable } from './img-scheme.mjs';

const PICTURE = /\.(png|jpe?g|gif|webp|avif)$/i;

export function folderPictures({ src, product, products = [], accountRoot, storeRoot, limit = 60, fs = fsDefault }) {
  if (typeof src !== 'string' || !src.trim()) return { ok: false, error: 'No folder was named.' };
  const named = src.replace(/\/+$/, '');
  const found = resolveArtifact({ src: named, product, products, accountRoot, storeRoot, fs });
  if (!found.ok) return { ok: false, error: found.error };
  const own = products.find((p) => p.slug === product) ?? null;
  const roots = [accountRoot, own?.dir, own?.repoPath].filter(Boolean);
  let entries;
  try {
    if (!fs.statSync(found.path).isDirectory()) return { ok: false, error: `${src} is not a folder.` };
    entries = fs.readdirSync(found.path, { withFileTypes: true });
  } catch (e) {
    return { ok: false, error: `${src} could not be read (${e.message}).` };
  }
  const pictures = [];
  for (const entry of entries) {
    if (!entry.isFile() || !PICTURE.test(entry.name)) continue;
    const file = path.join(found.path, entry.name);
    if (!servable(file, roots)) continue;
    let mtime = 0;
    try { mtime = fs.statSync(file).mtimeMs; } catch { continue; }
    pictures.push({ file, mtime });
  }
  if (!pictures.length && !roots.some((r) => found.path === r || found.path.startsWith(r + path.sep))) {
    return { ok: false, error: `${src} is not in this project.` };
  }
  pictures.sort((a, b) => b.mtime - a.mtime || a.file.localeCompare(b.file));
  return { ok: true, folder: found.path, pictures: pictures.slice(0, limit).map((p) => p.file), total: pictures.length };
}

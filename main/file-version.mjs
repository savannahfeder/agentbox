// A document edited in the big view becomes the next version of itself. It goes
// in the thread's own designs folder rather than beside the original, which may
// be in a code repository that nobody asked to see a new file in.
import fsDefault from 'node:fs';
import path from 'node:path';
import { familyName, familyOfName, filesInLines, nextVersionName, reviewKind, threadFiles } from '../shared/artifact-marks.mjs';
import { mergeThree } from '../shared/doc-merge.mjs';
import { MAX_DOC_BYTES } from './doc-file.mjs';

const THREAD_ID = /^[\w-]{1,64}$/;

/**
 * Writes `text` as the next version of a file named on this thread, found by its
 * path or its version id. `over` is the version that was already newest when this
 * one was made from an older one. `taken` is the names other copies of this file
 * hold, since one name is one version across copies. Never replaces a file.
 */
export function saveNextVersion({ dir, threadId, lines, basePath, baseId, text, taken = [], fs = fsDefault }) {
  if (!dir || !THREAD_ID.test(String(threadId ?? ''))) return { ok: false, error: 'That thread could not be found.' };
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'There is nothing to save.' };
  if (Buffer.byteLength(text) > MAX_DOC_BYTES) return { ok: false, error: 'That document is too big to save here.' };
  const clean = String(basePath ?? '').replace(/^\.\//, '');
  const families = threadFiles(filesInLines(lines));
  // A teammate's copy can name a version this thread has not said yet: same file, so the newest here.
  const family = families.find((f) => f.versions.some((v) => (clean ? v.path === clean : v.id === baseId)))
    ?? (clean ? undefined : families.find((f) => f.key === familyOfName(String(baseId ?? '').replace(/#\d+$/, ''))));
  const base = family?.versions.find((v) => (clean ? v.path === clean : v.id === baseId)) ?? family?.versions.at(-1);
  if (!base) return { ok: false, error: 'That file is not on this thread, so nothing was saved.' };
  if (reviewKind(base.path) !== 'markdown') return { ok: false, error: 'Only documents can be edited here.' };

  const newest = family.versions[family.versions.length - 1];
  const words = newest.id === base.id ? text : withTheNewest({ dir, base, newest, text, fs });
  const folder = path.join(dir, 'designs', threadId);
  fs.mkdirSync(folder, { recursive: true });
  const held = new Set(taken);
  for (let n = family.versions.length; n < family.versions.length + 50 + held.size; n += 1) {
    const name = nextVersionName(newest.name, n);
    if (held.has(name)) continue;
    try {
      fs.writeFileSync(path.join(folder, name), words, { flag: 'wx' });
    } catch (err) {
      if (err?.code === 'EEXIST') continue;
      return { ok: false, error: String(err?.message ?? err).slice(0, 200) };
    }
    return { ok: true, path: `designs/${threadId}/${name}`, name, shown: familyName(family, newest), file: base.id, ...(newest.id !== base.id ? { over: newest.id } : {}) };
  }
  return { ok: false, error: 'Too many versions of that file are in the way, so nothing was saved.' };
}

/**
 * `text`, typed from a version that is no longer the newest, with whatever
 * landed in between. Somebody typing in the big view started from the version
 * they had open, so an agent's write arriving meanwhile used to leave two
 * versions with one set of words each (w-27a7ae314a). Their own words when the
 * two cannot be merged: never refused, because the words are already typed, and
 * `over` is what tells them the other version stands.
 */
function withTheNewest({ dir, base, newest, text, fs }) {
  const read = (v) => { try { return fs.readFileSync(path.isAbsolute(v.path) ? v.path : path.join(dir, v.path), 'utf8'); } catch { return null; } };
  const was = read(base);
  const since = read(newest);
  if (was == null || since == null) return text;
  const merged = mergeThree({ base: was, ours: since, theirs: text });
  return merged.ok ? merged.text : text;
}

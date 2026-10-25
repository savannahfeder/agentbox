// THE PROJECT'S DOCUMENTS FOLDER, FOR A CLOUD RUN.
//
// A worker on this Mac reads the plans and notes in the project's documents
// folder and writes its designs and reports there, where the app draws them.
// A cloud run gets a copy at the same path: everything small, and this
// thread's own designs folder, newest first, as much as fits. What it writes
// there comes back while it works and once more at the end
// (main/cloud/run.mjs), and is laid in here. Never a deletion, never over a
// file someone changed on this Mac while the run was away, and never over one
// the run did not take with it: those are kept, and the run's copy goes beside.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './exec.mjs';

// The folders that hold pictures by the gigabyte. Only this thread's own
// designs go up from them; the rest of the folder is small.
const HEAVY = new Set(['designs', 'attachments']);
export const DOCS_LIMITS = {
  file: 256 * 1024,
  ownFile: 25 * 1024 * 1024,
  own: 50 * 1024 * 1024,
  total: 100 * 1024 * 1024,
  files: 5000,
};

const inside = (p, root) => p === root || p.startsWith(root + path.sep);

/** The files, by path inside `dir`, that go up with a cloud run for `item`. */
export function docsToSend(dir, { item = null, limits = DOCS_LIMITS } = {}) {
  const own = item && /^[A-Za-z0-9_-]+$/.test(item) ? `designs/${item}` : null;
  const picked = [];
  let total = 0;
  let ownTotal = 0;
  const walk = (rel) => {
    let entries = [];
    try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (picked.length >= limits.files) return;
      if (e.name.startsWith('.')) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (/[\n\r]/.test(r)) continue;
      if (e.isDirectory()) {
        if (!rel && HEAVY.has(e.name)) { if (own && e.name === 'designs') walkOwn(); continue; }
        walk(r);
        continue;
      }
      if (!e.isFile()) continue;
      let size;
      try { size = fs.statSync(path.join(dir, r)).size; } catch { continue; }
      if (size > limits.file || total + size > limits.total) continue;
      picked.push(r);
      total += size;
    }
  };
  // Newest first: a thread whose designs do not all fit takes its latest
  // work, and the rest stays on this Mac.
  const walkOwn = () => {
    const found = [];
    const stack = [own];
    while (stack.length) {
      const rel = stack.shift();
      let entries = [];
      try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const r = `${rel}/${e.name}`;
        if (/[\n\r]/.test(r)) continue;
        if (e.isDirectory()) { stack.push(r); continue; }
        if (!e.isFile()) continue;
        let st;
        try { st = fs.statSync(path.join(dir, r)); } catch { continue; }
        if (st.size <= limits.ownFile) found.push({ r, size: st.size, at: st.mtimeMs });
      }
    }
    found.sort((a, b) => b.at - a.at || a.r.localeCompare(b.r));
    for (const f of found) {
      if (picked.length >= limits.files) return;
      if (ownTotal + f.size > limits.own) continue;
      picked.push(f.r);
      ownTotal += f.size;
    }
  };
  walk('');
  return picked;
}

/** Those files as one gzipped tar, paths inside `dir`. */
export function tarDocs(dir, files) {
  return run('tar', ['-czf', '-', '-C', dir, '--null', '-T', '-'], { input: files.join('\0') + '\0', encoding: null, env: { ...process.env, COPYFILE_DISABLE: '1' } });
}

const stampOf = (st) => `${st.size}:${Math.round(st.mtimeMs)}`;
const hashOf = (body) => crypto.createHash('sha256').update(body).digest('hex');

// `notes.md` -> `notes (cloud).md`, then `notes (cloud 2).md`, and so on.
function besideName(file) {
  const ext = path.extname(file);
  const base = file.slice(0, file.length - ext.length);
  for (let i = 1; ; i += 1) {
    const p = `${base} (cloud${i > 1 ? ` ${i}` : ''})${ext}`;
    if (!fs.existsSync(p)) return p;
  }
}

/**
 * Lay an archive of documents the run wrote into `dir`.
 *
 * `sentAt` is when the run left with the folder; `laid` is what earlier calls
 * for the same run wrote, path -> { stamp, hash }, and is updated in place. A
 * version this run already laid is never laid again: the run sends a file
 * until the Mac confirms it, so the same one can arrive twice. Otherwise a file
 * is written over only if it is missing here, unchanged here since the run
 * left, or is still exactly what this run itself laid. Anything else is a
 * change made on this Mac, and the run's copy goes beside it.
 *
 * `sent` is every path the run took with it. A file here that is not one of
 * them was never the run's to change, however old it is, so its copy goes
 * beside it too. A run recorded before the list was kept passes none.
 */
export async function layDocs({ tgz, dir, sentAt = 0, laid = {}, sent = null }) {
  const took = sent ? new Set(sent) : null;
  const out = { written: [], beside: [], moved: [] };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-docs-'));
  try {
    // From a file, not a pipe: tar may stop reading at the archive's end
    // marker, and a pipe it stopped reading fails the write (EPIPE) on a busy Mac.
    const file = path.join(tmp, '.agentbox-docs.tgz');
    fs.writeFileSync(file, tgz);
    const into = path.join(tmp, 'docs');
    fs.mkdirSync(into);
    await run('tar', ['-xzf', file, '-C', into]);
    fs.mkdirSync(dir, { recursive: true });
    const root = fs.realpathSync(dir);
    const files = [];
    const walk = (rel) => {
      for (const e of fs.readdirSync(path.join(into, rel), { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(r);
        else if (e.isFile()) files.push(r);
      }
    };
    walk('');
    // The nearest folder that exists, after links, must be this one or in
    // it: a link inside the folder never carries a file out of it.
    const safeParent = (file) => {
      let parent = path.dirname(file);
      while (!fs.existsSync(parent)) parent = path.dirname(parent);
      if (!inside(fs.realpathSync(parent), root)) return false;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      return inside(fs.realpathSync(path.dirname(file)), root);
    };
    for (const rel of files) {
      const asIs = path.join(root, rel);
      let target = asIs;
      const body = fs.readFileSync(path.join(into, rel));
      const hash = hashOf(body);
      if (laid[rel]?.hash === hash) continue;
      // A file whose folder here is a link out of it is not dropped: it lands
      // in a folder of its own, and the run's work is all still home.
      if (!safeParent(target)) {
        target = path.join(root, 'from-the-cloud', rel);
        if (!safeParent(target)) throw new Error(`nowhere safe to put ${rel}`);
        out.moved.push(path.relative(root, target));
      }
      let here = null;
      try { here = fs.lstatSync(target); } catch { /* new */ }
      // A link or a folder where the file goes is left as it is, and the
      // run's copy goes beside it.
      if (here && !here.isFile()) {
        target = besideName(target);
        out.beside.push(path.relative(root, target));
        here = null;
      }
      if (here) {
        // The same bytes already here: nothing to write. It becomes the run's
        // only if the run took it or wrote it before, never a file left here.
        if (here.size === body.length && fs.readFileSync(target).equals(body)) {
          const owned = !took || took.has(rel) || !!laid[rel]?.stamp;
          laid[rel] = { stamp: owned ? stampOf(here) : null, hash };
          continue;
        }
        const mine = laid[rel]?.stamp === stampOf(here);
        // Whole milliseconds on both sides: `sentAt` is a Date.now() and counts
        // them, an mtime does not, so a file saved 0.7 ms before the run left
        // read as newer than it and the run's own edit went beside a file
        // nobody had touched.
        const untouched = mine || (Math.floor(here.mtimeMs) <= sentAt && (!took || took.has(rel)));
        if (!untouched) {
          target = besideName(target);
          out.beside.push(path.relative(root, target));
        }
      }
      // A fresh name, made only if nothing is there: a link left at a name
      // this could guess would otherwise be written through.
      const part = path.join(path.dirname(target), `.agentbox-${crypto.randomUUID()}.part`);
      fs.writeFileSync(part, body, { flag: 'wx' });
      fs.renameSync(part, target);
      if (target === asIs) out.written.push(rel);
      laid[rel] = { stamp: target === asIs ? stampOf(fs.statSync(target)) : laid[rel]?.stamp ?? null, hash };
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return out;
}

/** The documents folder a run may take, or null: it must exist and must not hold, or sit in, the task folder. */
export function docsFolderFor(docs, cwd) {
  if (!docs || !path.isAbsolute(docs)) return null;
  let real;
  let realCwd;
  try { real = fs.realpathSync(docs); realCwd = fs.realpathSync(cwd); } catch { return null; }
  if (!fs.statSync(real).isDirectory()) return null;
  if (inside(real, realCwd) || inside(realCwd, real)) return null;
  return docs;
}

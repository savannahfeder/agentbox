// THE PICTURES, FILMS, SOUNDS AND PAGES A THREAD NAMES, FOR HER PHONE WITH THE
// MAC SHUT.
//
// A thread's copy online is its words (shared/phone-snapshot.mjs), and a path
// in those words is a file on this Mac that the hosted phone site cannot open.
// So for each thread carried, this finds the files its words name, inside that
// project's own folders only, uploads each once to her own private storage
// (named by what is in it, so the same file twice is one upload), and lists
// them in the thread's copy: the path as the screens ask for it, and the name
// online. A page brings the files it draws with it.
//
// What goes up is bounded three ways (per file, per thread, all together), and
// newest threads go first; a file over the per-file bound is listed as too big,
// so the phone can say so instead of drawing nothing. A file no thread names
// any more is deleted after a few days.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hideSecrets } from '../shared/phone-snapshot.mjs';
import { readPictureShapeSync } from './picture-shape.mjs';

// A tenth of the Pro plan's 100 GB, which the organization's projects share;
// past it the oldest threads' files make way (`trimBelow`).
export const UPLOAD_LIMITS = { fileBytes: 25 * 1024 * 1024, threadBytes: 100 * 1024 * 1024, totalBytes: 10 * 1024 ** 3, files: 60, days: 7 };
const KEEP_UNNAMED_MS = 3 * 24 * 3600_000;
const LOOK_AGAIN_MS = 5 * 60_000;
// After a refused upload (no bucket yet, offline, signed out of storage) the
// uploader rests, rather than reading every queued file again to be refused again.
const REST_AFTER_REFUSAL_MS = 30 * 60_000;

const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.html': 'text/html', '.htm': 'text/html', '.pdf': 'application/pdf', '.md': 'text/markdown', '.markdown': 'text/markdown',
};
// Documents, named anywhere in the words as the kinds above are.
const OFFICE = 'application/vnd.openxmlformats-officedocument';
const DOCUMENTS = {
  '.txt': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8', '.yml': 'text/yaml; charset=utf-8', '.xml': 'text/xml', '.rtf': 'application/rtf', '.heic': 'image/heic',
  '.doc': 'application/msword', '.docx': `${OFFICE}.wordprocessingml.document`, '.xls': 'application/vnd.ms-excel', '.xlsx': `${OFFICE}.spreadsheetml.sheet`,
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': `${OFFICE}.presentationml.presentation`, '.pages': 'application/vnd.apple.pages', '.numbers': 'application/vnd.apple.numbers', '.zip': 'application/zip',
};
// What a page may bring with it, besides the kinds above.
const PAGE_PARTS = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const PICTURE = /\.(png|jpe?g|gif|webp|avif)$/i;
// Keys, certificates and databases never go, whatever way they are named.
const NEVER = /\.(pem|key|p12|pfx|kdbx|keystore|jks|der|crt|cer|asc|gpg|sqlite3?|db)$/i;
const EXT = [...Object.keys(TYPES), ...Object.keys(DOCUMENTS)].map((e) => e.slice(1)).join('|');
// A path as a worker writes one: bare, after ~/ or /, or in quotes with spaces.
const NAMED = new RegExp(String.raw`(?:["“'‘]((?:~\/|\/)?[^"”'’\r\n]+\.(?:${EXT}))["”'’])|((?:~\/|\/)?[\w@%+=,.\/-]*[\w-]\.(?:${EXT}))(?![\w])`, 'gi');
// Any kind at all where the screens draw it as a file: a markdown link's
// target (a reply's attachments) or a path in backticks.
const LINKED = /\]\(<?([^)\s>]+\.[A-Za-z0-9]{1,10})>?\)|`([^`\s]+\.[A-Za-z0-9]{1,10})`/g;
const FOLDER_LINE = /(?:^|\n)[ \t]*((?:~\/|\/)[\w./-]*[\w-])\/?[ \t]*(?=\n|$)/g;
const SKIP_SEGMENTS = new Set(['node_modules', '.git']);
// A file whose name says it holds a secret never goes, whatever its kind.
const SECRET_NAME = /(secret|credential|passw|token|private[-_.]?key|(^|[/.])env($|[/.]))/i;
// Words, not pictures: what goes up is the text with its keys hidden, as a
// thread's words are. A file of another kind whose bytes are text goes so too.
const TEXT = /\.(html?|md|markdown|css|svg|txt|log|json|csv|tsv|ya?ml|xml)$/i;
// Not pictures, films or sounds, which are never read as text.
const MEDIA = /\.(png|jpe?g|gif|webp|avif|heic|mp3|wav|m4a|aac|ogg|mp4|mov|m4v|webm|pdf|zip|docx?|xlsx?|pptx?|pages|numbers|woff2?|ttf|otf)$/i;
// A spreadsheet's column whose heading names a secret is emptied: a password
// in a column has no name beside it for the text rules to hide it by.
const SECRET_COLUMN = /pass|secret|token|key|credential|auth/i;
// A page or stylesheet bigger than this is listed but not read for what it draws.
const PAGE_READ_MAX = 2 * 1024 * 1024;
// And all the pages one thread names, read for what they draw, at most this much.
const PAGES_READ_MAX = 6 * 1024 * 1024;

/** At most `max` bytes of a file, through one open handle; null for a bigger one. */
function readAtMost(file, max) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const buf = Buffer.alloc(max + 1);
    let n = 0;
    for (let got; n <= max && (got = fs.readSync(fd, buf, n, max + 1 - n, null)) > 0;) n += got;
    return n > max ? null : buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

const knownType = (file) => TYPES[path.extname(file).toLowerCase()] ?? PAGE_PARTS[path.extname(file).toLowerCase()] ?? null;
/** What a file goes up as, or null for one that never goes. */
export const typeOf = (file) => {
  if (NEVER.test(file) || SECRET_NAME.test(path.basename(file))) return null;
  return knownType(file) ?? DOCUMENTS[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
};

const cellsOf = (line, sep) => {
  const out = [];
  let cell = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) { out.push(cell); cell = ''; } else cell += ch;
  }
  out.push(cell);
  return out;
};
/** A spreadsheet's text with every column whose heading names a secret emptied. */
export function hideCsvSecrets(text) {
  const lines = String(text).split('\n');
  const head = (lines[0] ?? '').replace(/\r$/, '');
  const sep = head.includes('\t') && !head.includes(',') ? '\t' : ',';
  const hide = cellsOf(head, sep).map((h, i) => (SECRET_COLUMN.test(h) ? i : -1)).filter((i) => i >= 0);
  if (!hide.length) return String(text);
  return [lines[0], ...lines.slice(1).map((line) => {
    if (!line) return line;
    const cr = line.endsWith('\r');
    const cells = cellsOf(cr ? line.slice(0, -1) : line, sep);
    for (const i of hide) if (i < cells.length) cells[i] = '[hidden]';
    return cells.join(sep) + (cr ? '\r' : '');
  })].join('\n');
}

// Bytes that read as text: no NUL near the start, and whole UTF-8.
function readsAsText(buf) {
  if (buf.subarray(0, 8000).includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(buf); return true; } catch { return false; }
}

// Newest first, so a long thread's latest messages are the ones its bound keeps.
function textsOf(snapshot) {
  const out = [];
  const add = (v) => { if (typeof v === 'string' && v) out.push(v); };
  for (const v of Object.values(snapshot?.item ?? {})) add(v);
  for (const l of [...(snapshot?.history ?? [])].reverse()) for (const v of Object.values(l?.patch ?? {})) add(v);
  return out;
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const within = (root, file) => !!root && (file === root || file.startsWith(root + path.sep));

/**
 * Where a file is, as the phone knows it: relative to the project's documents
 * folder, or `@repo/` and relative to its code. Null outside both.
 */
export function keyOf(file, { docs, repo }) {
  if (docs && within(docs, file)) return path.relative(docs, file).split(path.sep).join('/');
  if (repo && within(repo, file)) return `@repo/${path.relative(repo, file).split(path.sep).join('/')}`;
  return null;
}

/**
 * The files a thread's copy names, as [{ key, file }], inside the project's
 * own folders only. A bare name is looked for where the screens look for it
 * (renderer/src/message-folders.ts pictureRoots), in that order.
 */
export function filesNamed(snapshot, { dir, repoPath = null, home }) {
  const docs = dir && real(dir);
  if (!docs) return [];
  const repo = repoPath ? real(repoPath) : null;
  const id = snapshot?.item?.id;
  const found = new Map();
  const take = (abs) => {
    const file = real(abs);
    if (!file || file.split(path.sep).some((seg) => SKIP_SEGMENTS.has(seg)) || SECRET_NAME.test(path.basename(file))) return false;
    const key = keyOf(file, { docs, repo });
    if (!key) return false;
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile() || !typeOf(file)) return false;
    if (!found.has(key)) found.set(key, file);
    return true;
  };
  const full = (p) => path.resolve(p.startsWith('~/') ? path.join(home, p.slice(2)) : p);
  const texts = textsOf(snapshot);
  const named = [];
  for (const text of texts) {
    for (const m of text.matchAll(NAMED)) named.push((m[1] ?? m[2]).trim());
    for (const m of text.matchAll(LINKED)) { try { named.push(decodeURI(m[1] ?? m[2]).trim()); } catch { named.push((m[1] ?? m[2]).trim()); } }
  }
  // The folders the words name come first, as they do on the screens.
  const folders = [];
  for (const n of named) if (n.includes('/')) folders.push(path.dirname(n.startsWith('/') || n.startsWith('~/') ? full(n) : path.join(docs, n)));
  for (const text of texts) for (const m of text.matchAll(FOLDER_LINE)) folders.push(full(m[1]));
  const roots = [...new Set([
    ...folders, id && path.join(docs, 'designs', id), repo && id && path.join(repo, '.claude', 'worktrees', id),
    docs, path.join(docs, 'designs'), path.join(docs, 'attachments'), repo, repo && path.join(repo, 'designs'),
  ].filter(Boolean))];
  for (const n of named) {
    if (/^[a-z]+:\/\//i.test(n)) continue;
    if (n.startsWith('/') || n.startsWith('~/')) { take(full(n)); continue; }
    const rel = n.replace(/^\.\//, '');
    if (rel.split('/').includes('..')) continue;
    for (const root of roots) if (fs.existsSync(path.join(root, rel)) && take(path.join(root, rel))) break;
  }
  return [...found].map(([key, file]) => ({ key, file }));
}

/** The folders a thread's copy names on a line of their own, as [{ key, pictures: [{ key, file }] }], newest pictures first. */
export function foldersNamed(snapshot, { dir, repoPath = null, home, limit = 6 }) {
  const docs = dir && real(dir);
  if (!docs) return [];
  const repo = repoPath ? real(repoPath) : null;
  const out = [];
  for (const text of textsOf(snapshot)) {
    for (const m of text.matchAll(FOLDER_LINE)) {
      const named = m[1];
      if (/\.[a-z0-9]{1,8}$/i.test(named)) continue;
      const folder = real(path.resolve(named.startsWith('~/') ? path.join(home, named.slice(2)) : named));
      const key = folder && keyOf(folder, { docs, repo });
      if (!key || out.some((f) => f.key === `${key}/`)) continue;
      let entries = [];
      try { entries = fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isFile() && PICTURE.test(e.name)); } catch { continue; }
      const pictures = entries
        .map((e) => ({ key: `${key}/${e.name}`, file: path.join(folder, e.name), m: fs.statSync(path.join(folder, e.name)).mtimeMs }))
        .sort((a, b) => b.m - a.m || a.key.localeCompare(b.key))
        .slice(0, limit)
        .map(({ key: k, file }) => ({ key: k, file }));
      out.push({ key: `${key}/`, pictures });
    }
  }
  return out;
}

// What a page draws from beside it: src, href, poster, srcset and url() that
// name a file next to it rather than a site. A stylesheet's own url()s too.
const REFS = /\b(?:src|href|poster|data-src)\s*=\s*["']([^"'#?]+)[^"']*["']|\bsrcset\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')#?]+)[^"')]*["']?\s*\)/gi;
export function partsOf(text) {
  const out = new Set();
  for (const m of String(text).matchAll(REFS)) {
    const list = m[2] ? m[2].split(',').map((s) => s.trim().split(/\s+/)[0]) : [m[1] ?? m[3]];
    for (const ref of list) {
      if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(ref)) continue;
      out.add(decodeURIComponent(ref));
    }
  }
  return [...out];
}

/** A page's own files, as [{ key, file }], one stylesheet deep, inside the project's folders only. */
export function pageParts(page, { docs, repo, budget = { bytes: PAGES_READ_MAX } }) {
  const out = new Map();
  const visit = (file, depth) => {
    let text;
    try {
      const raw = readAtMost(file, Math.min(PAGE_READ_MAX, budget.bytes));
      if (!raw) return;
      budget.bytes -= raw.length;
      text = raw.toString('utf8');
    } catch { return; }
    for (const ref of partsOf(text)) {
      const part = real(path.join(path.dirname(file), ref));
      const key = part && keyOf(part, { docs, repo });
      if (!key || out.has(key) || !knownType(part) || SECRET_NAME.test(path.basename(part)) || part.split(path.sep).some((seg) => SKIP_SEGMENTS.has(seg))) continue;
      try { if (!fs.statSync(part).isFile()) continue; } catch { continue; }
      out.set(key, part);
      if (depth < 1 && /\.css$/i.test(part)) visit(part, depth + 1);
    }
  };
  visit(page.file, 0);
  return [...out].map(([key, file]) => ({ key, file }));
}

/**
 * The uploader. `manifest(...)` says what a thread's copy lists now (only what
 * is already online, so the phone never asks for a file that is not there yet)
 * and queues the rest; `kick()` uploads what is queued, one file at a time, in
 * the background; `sweep()` deletes what nothing has named for days.
 */
export function createPhoneUploads({ backend, owner, device, alive = () => true, state, save, home, now = Date.now, limits = UPLOAD_LIMITS, log = () => {} }) {
  state.uploaded ??= {}; // name -> { bytes, named: last moment a thread named it, rank: newest thread naming it }
  // What each file on this Mac is called online, learnt by the upload (off
  // the window's thread, a piece at a time) and good while it is unchanged.
  const names = new Map(); // file -> { size, mtimeMs, name }
  const queue = new Map(); // file -> { bytes, rank, roots, threads }
  const memo = new Map(); // thread -> { base, at, sig, out }
  let running = null;
  let restUntil = 0;
  let saidFull = false;
  let madeRoom = 0;
  // A file on record from before ranks were kept reads as oldest, so nothing is
  // taken until every thread has looked again and said how new its files are.
  const startedAt = now();

  const known = (file, st) => {
    const was = names.get(file);
    return was && was.size === st.size && was.mtimeMs === st.mtimeMs ? was.name : null;
  };
  // A picture's width and height, so the phone draws its box at that shape
  // before the picture arrives; read again only when the file changes.
  const shapes = new Map(); // file -> { size, mtimeMs, shape }
  const shapeOf = (file, st) => {
    if (!PICTURE.test(file)) return null;
    const was = shapes.get(file);
    if (was && was.size === st.size && was.mtimeMs === st.mtimeMs) return was.shape;
    let shape = null;
    try { shape = readPictureShapeSync(file); } catch { /* drawn 4:3 until it arrives, as before */ }
    shapes.set(file, { size: st.size, mtimeMs: st.mtimeMs, shape });
    return shape;
  };
  const total = () => Object.values(state.uploaded).reduce((n, u) => n + (u.bytes || 0), 0);
  const olderThan = (rank) => Object.entries(state.uploaded)
    .filter(([, u]) => (u.rank ?? 0) < rank)
    .sort((a, b) => (a[1].rank ?? 0) - (b[1].rank ?? 0) || (a[1].named ?? 0) - (b[1].named ?? 0));
  const roomFor = (bytes, rank) => {
    const over = total() + bytes - limits.totalBytes;
    if (over <= 0) return true;
    if (now() - startedAt < LOOK_AGAIN_MS) return false;
    return olderThan(rank).reduce((n, [, u]) => n + (u.bytes || 0), 0) >= over;
  };
  // THE NEWEST WORK GOES FIRST WHEN THE SPACE IS FULL: the oldest threads'
  // files leave to make room, and never those of a thread as new as this one.
  // Only after the new file is up, so a refused upload takes nothing away; the
  // space runs over by that one file until then.
  async function trimBelow(rank) {
    const over = total() - limits.totalBytes;
    if (over <= 0) return;
    const drop = [];
    let freed = 0;
    for (const [n, u] of olderThan(rank)) {
      if (freed >= over) break;
      drop.push(n);
      freed += u.bytes || 0;
    }
    if (!drop.length) return;
    await backend.dropPhoneFiles({ owner, device, names: drop });
    for (const n of drop) delete state.uploaded[n];
    save();
    for (const m of memo.values()) m.at = -Infinity;
    madeRoom += drop.length;
  }
  const full = () => {
    if (!saidFull) log('phone: the space for files is full');
    saidFull = true;
  };

  /**
   * What thread `sk`'s copy (`made()`, built only when needed) lists:
   * { files: { key: { n, s } | { s, big: true } }, folders?: { 'key/': [keys] } },
   * or null when it names nothing that can go. Newer threads upload first.
   * Its words are read again when they change (`base`, the copy's own key) and
   * its files looked at again every five minutes, since a page can change under the
   * same words.
   */
  function manifest(sk, made, { dir, repoPath = null, updatedAt = 0, base = '' }) {
    const was = memo.get(sk);
    if (was && was.base === base && now() - was.at < LOOK_AGAIN_MS) return was.out;
    const rank = Number(updatedAt) || 0;
    let out = null;
    if (now() - rank <= limits.days * 24 * 3600_000) {
      const snapshot = typeof made === 'function' ? made() : made;
      const named = filesNamed(snapshot, { dir, repoPath, home });
      const folders = foldersNamed(snapshot, { dir, repoPath, home });
      const where = { docs: real(dir), repo: repoPath && real(repoPath) };
      // Each page with its own files right after it.
      const all = new Map();
      const budget = { bytes: PAGES_READ_MAX };
      for (const f of named) {
        if (all.size >= limits.files) break;
        if (!all.has(f.key)) all.set(f.key, f.file);
        if (/\.html?$/i.test(f.file) && budget.bytes > 0) for (const p of pageParts(f, { ...where, budget })) if (!all.has(p.key)) all.set(p.key, p.file);
      }
      for (const f of folders) for (const p of f.pictures) if (!all.has(p.key)) all.set(p.key, p.file);
      const files = {};
      let bytes = 0;
      for (const [key, file] of [...all].slice(0, limits.files)) {
        let st;
        try { st = fs.statSync(file); } catch { continue; }
        if (st.size > limits.fileBytes || bytes + st.size > limits.threadBytes) { files[key] = { s: st.size, big: true }; continue; }
        bytes += st.size;
        const name = known(file, st);
        if (name && state.uploaded[name]) {
          const shape = shapeOf(file, st);
          files[key] = shape ? { n: name, s: st.size, w: shape.w, h: shape.h } : { n: name, s: st.size };
          state.uploaded[name].named = now();
          state.uploaded[name].rank = Math.max(state.uploaded[name].rank ?? 0, rank);
        } else {
          const job = queue.get(file) ?? { bytes: st.size, rank, roots: [where.docs, where.repo].filter(Boolean), threads: new Set() };
          job.rank = Math.max(job.rank, rank);
          job.threads.add(sk);
          queue.set(file, job);
        }
      }
      if (Object.keys(files).length) {
        out = { files };
        const listed = Object.fromEntries(folders.map((f) => [f.key, f.pictures.map((p) => p.key).filter((k) => files[k]?.n)]).filter(([, keys]) => keys.length));
        if (Object.keys(listed).length) out.folders = listed;
      }
    }
    // The same object while nothing in it changed, so the publisher can tell.
    const sig = JSON.stringify(out);
    if (was?.sig === sig) out = was.out;
    // Each thread's next look at its own moment, so they do not all fall in one pass.
    const spread = was ? 0 : (parseInt(crypto.createHash('sha1').update(sk).digest('hex').slice(0, 8), 16) % LOOK_AGAIN_MS);
    memo.set(sk, { base, at: now() - spread, sig, out });
    return out;
  }

  // The file as it is now, read only if it is still the one that was checked:
  // no link anywhere on its way, inside the project, a plain file within the bound.
  async function readChecked(file, roots) {
    if (real(file) !== file || !roots.some((r) => within(r, file))) return null;
    const fh = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const st = await fh.stat();
      const there = fs.statSync(file);
      if (!st.isFile() || st.ino !== there.ino || st.dev !== there.dev || real(file) !== file || st.size > limits.fileBytes) return null;
      const buf = Buffer.alloc(st.size + 1);
      let n = 0;
      for (let got; n <= st.size && (got = (await fh.read(buf, n, st.size + 1 - n, n)).bytesRead) > 0;) n += got;
      // Grew while it was read: the next pass looks at it again.
      if (n !== st.size) return null;
      const raw = buf.subarray(0, n);
      if (!TEXT.test(file) && (MEDIA.test(file) || !readsAsText(raw))) return { st, data: raw };
      const words = /\.(csv|tsv)$/i.test(file) ? hideCsvSecrets(raw.toString('utf8')) : raw.toString('utf8');
      return { st, data: Buffer.from(hideSecrets(words, { home })) };
    } finally {
      await fh.close();
    }
  }

  async function pump() {
    while (queue.size) {
      if (!alive()) return;
      const [file, job] = [...queue].sort((a, b) => b[1].rank - a[1].rank)[0];
      queue.delete(file);
      try {
        const was = names.get(file);
        if (!(was && state.uploaded[was.name]) && !roomFor(job.bytes, job.rank)) { full(); continue; }
        // A file gone or changed since it was named is skipped; only a refused upload rests the uploader.
        const read = await readChecked(file, job.roots).catch(() => null);
        if (!read) continue;
        const name = `${crypto.createHash('sha256').update(read.data).digest('hex')}${path.extname(file).toLowerCase()}`;
        names.set(file, { size: read.st.size, mtimeMs: read.st.mtimeMs, name });
        if (!state.uploaded[name]) {
          if (!roomFor(read.data.length, job.rank)) { full(); continue; }
          if (!alive()) return;
          await backend.putPhoneFile({ owner, device, name, data: read.data, type: typeOf(file) });
          state.uploaded[name] = { bytes: read.data.length, named: now(), rank: job.rank };
          saidFull = false;
          save();
          await trimBelow(job.rank);
        } else state.uploaded[name].rank = Math.max(state.uploaded[name].rank ?? 0, job.rank);
        // The threads that name it look again at what they list.
        for (const sk of job.threads) { const m = memo.get(sk); if (m) m.at = -Infinity; }
      } catch (err) {
        log(`phone: could not send a file, trying again in half an hour (${err?.message ?? err})`);
        restUntil = now() + REST_AFTER_REFUSAL_MS;
        return;
      }
    }
  }

  return {
    manifest,
    /** Upload what is queued, in the background; the run already going if there is one. */
    kick() {
      if (!running && queue.size && now() >= restUntil) {
        running = pump().finally(() => {
          running = null;
          if (madeRoom) log(`phone: took ${madeRoom} older file${madeRoom === 1 ? '' : 's'} off your phone to make room for newer ones`);
          madeRoom = 0;
        });
      }
      return running ?? Promise.resolve();
    },
    pending: () => queue.size,
    pendingBytes: () => [...queue.values()].reduce((n, j) => n + j.bytes, 0),
    /** Delete what no thread has named for days. */
    async sweep() {
      const old = Object.entries(state.uploaded).filter(([, u]) => now() - (u.named || 0) > KEEP_UNNAMED_MS).map(([n]) => n);
      if (!old.length || !alive()) return 0;
      await backend.dropPhoneFiles({ owner, device, names: old });
      for (const n of old) delete state.uploaded[n];
      save();
      return old.length;
    },
    forget(sk) { memo.delete(sk); },
  };
}

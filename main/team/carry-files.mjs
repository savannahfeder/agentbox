// CARRYING A FILE A MESSAGE NAMES TO EVERYONE WHO CAN READ THE MESSAGE.
//
// Two small pieces, and any place that shares words can use them, given a way to
// put and take bytes where only the people on those words can reach them:
//
//   findFileToSend   what on this computer a name may mean, and whether it may go
//   createFileCarrier
//     .send(ref)     the sender: up to the cloud and shelved here; answers the
//                    entry to hand the readers. A file over 10 MB goes in parts
//                    of 8 MB, in the background, up to 200 MB.
//     .take(entries) a reader: down from the cloud and shelved here, by the list;
//                    the parts of a big file are put back together here
//     .takeMissing() a reader: another try at what has not landed
import crypto from 'node:crypto';
import fsDefault from 'node:fs';
import path from 'node:path';
import { resolveArtifact } from '../artifact-path.mjs';
import { MAX_CARRIED_BYTES, MAX_SENT_BYTES, PART_BYTES, filesADocumentDraws, isCarriedKind, namedFiles, plainRef, sizeWords } from '../../shared/carried-files.mjs';
import { chunkFile, entryKey, partFile, plainPartPath, shelve, shelvedEntries, validEntry } from './carried-shelf.mjs';

const WORKTREE = /(^|\/)\.claude\/worktrees\/[^/]+\//;
const MAX_PARTS = 40;
const MAX_ENTRY_BYTES = 3 * MAX_CARRIED_BYTES;
const TRIES_AT_A_PIECE = 3;
const ROUNDS_WITHOUT_A_PIECE = 10;

const isPicture = (file) => /\.(?:png|jpe?g|gif|webp|svg|avif)$/i.test(file);
const isInside = (root, file) => file === root || file.startsWith(root + path.sep);
const hiddenIn = (rel) => rel.replace(WORKTREE, '$1').split('/').some((s) => s.startsWith('.'));

// A name that says what is inside it is no business of a message. Only the
// kinds in shared/carried-files.mjs can go at all; this stops `secrets.md`.
const SECRET_WORD = /(^|[-_. ])(secrets?|credentials?|private[-_ ]?keys?|(?:api|access|ssh|secret)[-_ ]?keys?|id_(?:rsa|ed25519|ecdsa|dsa)|keychain|netrc)([-_. ]|$)/i;
const SECRET_STEM = /^(?:\.?env(?:\.[\w-]+)?|keys?|passwords?|passwd)$/i;
export const looksSecret = (rel) => String(rel).split('/').some((seg) => SECRET_WORD.test(seg) || SECRET_STEM.test(seg.replace(/\.(?:md|markdown|html?|pdf|png|jpe?g|txt)$/i, '')));

function realOf(file, fs) { try { return fs.realpathSync(file); } catch { return null; } }

/** Where a real file sits in a project: `{ root, rel }`, `{ hidden }` when something on the way is hidden, or null. */
function placeIn(project, real, fs) {
  let hidden = false;
  for (const root of [project.dir, project.repoPath].filter(Boolean)) {
    const home = realOf(root, fs);
    if (!home || !isInside(home, real)) continue;
    const rel = path.relative(home, real).split(path.sep).join('/');
    if (hiddenIn(rel)) { hidden = true; continue; }
    return { root: home, rel };
  }
  return hidden ? { hidden: true } : null;
}

/**
 * What a name written in a message means on the sender's computer, as
 * `{ file, size, root }`, or `{ none: why }` when it may not go: `missing`,
 * `secret`, `hidden` or `outside`.
 *
 * A NAME THE SENDER MEANT (a link, a code span, a path) may be any file in any
 * of the sender's projects: they pointed at it. A BARE WORD that merely looks
 * like a file name is a guess, so it only looks where everyone on the message
 * may already see: otherwise "salaries.md" in a chat would find a file in a
 * private project and send it. Never another conversation's folder, and never
 * a file whose real place is outside the projects or behind a hidden folder.
 */
export async function findFileToSend({ ref, meant = false, conversation, products, fs = fsDefault }) {
  const raw = plainRef(ref);
  if (!isCarriedKind(raw)) return { none: 'missing' };
  if (looksSecret(raw)) return { none: 'secret' };
  const home = raw.startsWith('~/') ? process.env.HOME : null;
  const asked = home ? path.join(home, raw.slice(2)) : raw;
  const others = products.filter((p) => !p.team?.direct);
  const own = conversation?.dir ? products.find((p) => p.dir === conversation.dir) : null;

  const answer = (real, place) => {
    if (looksSecret(place.rel)) return { none: 'secret' };
    let st;
    try { st = fs.statSync(real); } catch { return { none: 'missing' }; }
    return st.isFile() ? { file: real, size: st.size, root: place.root } : { none: 'missing' };
  };

  if (path.isAbsolute(asked)) {
    const real = realOf(asked, fs);
    if (!real) return { none: 'missing' };
    let hidden = false;
    for (const p of [...others, ...(own ? [own] : [])]) {
      const place = placeIn(p, real, fs);
      if (place?.root) return answer(real, place);
      if (place?.hidden) hidden = true;
    }
    return { none: hidden ? 'hidden' : 'outside' };
  }

  if (raw.split('/').some((s) => s === '..')) return { none: 'outside' };
  if (hiddenIn(raw)) return { none: 'hidden' };
  const people = conversation?.people ?? null;
  const everyoneMaySee = (p) => p.team?.projectId && (p.team.visibility !== 'people'
    || (people?.length > 0 && people.every((who) => who === p.team.sharedBy || p.team.people?.includes(who))));
  // This conversation's own folder only by exact path: a walk through it would
  // find a teammate's file of the same name, and send it on as yours.
  if (own && !raw.startsWith('attachments/carried/')) {
    const real = realOf(path.join(own.dir, raw), fs);
    const place = real && placeIn(own, real, fs);
    if (place?.root) return answer(real, place);
  }
  let best = null;
  for (const p of others.filter((x) => meant || everyoneMaySee(x))) {
    const found = await resolveArtifact({ src: raw, product: p.slug, products: [{ ...p, team: undefined }], fs, fresh: true });
    if (!found.ok) continue;
    const real = realOf(found.path, fs);
    const place = real && placeIn(p, real, fs);
    if (!place?.root) continue;
    const at = fs.statSync(real).mtimeMs;
    if (!best || at > best.at) best = { real, place, at };
  }
  return best ? answer(best.real, best.place) : { none: 'missing' };
}

const safeName = (file, room = 140) => path.basename(file).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(-room) || 'file';
const sumOf = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const cloudNameOf = (bytes, file) => `${sumOf(bytes)}-${safeName(file)}`;

// The document and the pictures it draws, each inside the same project and each
// named by the document: a neighbour nobody draws stays behind. A main file over
// the limit (a film) is read later, a piece at a time, and draws nothing.
function partsOf({ file, root, size }, fs) {
  if (size > MAX_CARRIED_BYTES) return [{ file, big: true, size, path: path.basename(file) }];
  const main = { file, bytes: fs.readFileSync(file) };
  const parts = [main];
  if (/\.(?:md|markdown|html?)$/i.test(file)) {
    let total = main.bytes.length;
    for (const drawn of filesADocumentDraws(main.bytes.toString('utf8')).slice(0, MAX_PARTS)) {
      const real = realOf(path.resolve(path.dirname(file), drawn), fs);
      if (!real || !isInside(root, real) || real === file) continue;
      const rel = path.relative(root, real).split(path.sep).join('/');
      if (hiddenIn(rel) || looksSecret(rel)) continue;
      let partSize;
      try { const st = fs.statSync(real); if (!st.isFile()) continue; partSize = st.size; } catch { continue; }
      if (partSize > MAX_CARRIED_BYTES || total + partSize > MAX_ENTRY_BYTES) continue;
      total += partSize;
      parts.push({ file: real, bytes: fs.readFileSync(real) });
    }
  }
  // From the deepest folder holding them all, so the document still finds its
  // pictures by the same relative paths on the reader's disk.
  let top = path.dirname(file);
  while (!parts.every((p) => isInside(top, p.file))) top = path.dirname(top);
  return parts.map((p) => ({ ...p, path: path.relative(top, p.file).split(path.sep).join('/') }));
}

/** The pieces a big file is cut into: how many, and how long each is. Nothing is read. */
export function pieceSizes(size) {
  const n = Math.ceil(size / PART_BYTES);
  return Array.from({ length: n }, (_, i) => Math.min(PART_BYTES, size - i * PART_BYTES));
}

const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * A room keeps each message as it is written and has no ledger to say what a
 * name means, so the words themselves change on the way out: a file named in
 * them goes up and the name becomes a link to it, and a file too big gets a line
 * everyone reads. A name nothing was found for is left as it was.
 */
export async function carryIntoRoom(body, { find, put, log = () => {}, fs = fsDefault }) {
  if (!find) return body;
  let words = body;
  const said = [];
  for (const { ref, meant } of namedFiles(body)) {
    if (ref.startsWith('attachments/')) continue;
    const found = await Promise.resolve(find(ref, { meant })).catch(() => null);
    if (!found?.file) continue;
    const shown = path.basename(ref);
    if (found.size > MAX_CARRIED_BYTES) { said.push(`${shown} is ${sizeWords(found.size)}, over the 10 MB a group can carry. Share it in a thread instead.`); continue; }
    const bytes = fs.readFileSync(found.file);
    const cloud = cloudNameOf(bytes, found.file);
    try { await put(cloud, bytes.toString('base64')); } catch (err) {
      log(`room files: sending ${cloud}: ${err?.message ?? err}`);
      said.push(`${shown} did not send. Send the message again to try once more.`);
      continue;
    }
    const link = `${isPicture(ref) ? '!' : ''}[${shown}](attachments/${cloud})`;
    const name = escaped(ref);
    words = words
      .replace(new RegExp(`\\]\\(\\s*(?:\\./)?${name}\\s*\\)`, 'g'), () => `](attachments/${cloud})`)
      .replace(new RegExp(`\`(?:\\./)?${name}\``, 'g'), () => link)
      .replace(new RegExp(`(?<![\\w./(\\[\\]-])(?:\\./)?${name}(?![\\w/-])`, 'g'), () => link);
  }
  return said.length ? `${words}\n\n${said.join('\n')}` : words;
}

export function createFileCarrier({
  dir, has, put, get, find, now = Date.now, log = () => {}, fs = fsDefault,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), retryMs = [1000, 4000],
}) {
  const uploads = new Map(); // ref -> { key, done, entry, error }
  const downloads = new Map(); // `${entry key}/${part}` -> promise
  const rounds = new Map(); // the same key -> rounds that brought no new piece
  const givenUp = new Set();

  const quietly = async (what, fn, fallback) => {
    try { return await fn(); } catch (err) { log(`team files: ${what}: ${err?.message ?? err}`); return fallback; }
  };

  // The sender's own word about a name, kept only here. Not written again when
  // nothing in it changed, so a long upload does not rewrite the index each pass.
  const noting = (entry) => {
    const was = shelvedEntries(dir, { fs }).find((e) => e.ref === entry.ref);
    const plain = (e) => JSON.stringify({ ...e, at: 0 });
    if (was && plain(was) === plain(entry)) return;
    shelve(dir, [entry], { fs });
  };

  function store(entry, part, bytes) {
    const to = partFile(dir, entry, part);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const tmp = `${to}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, to);
  }

  async function putWithRetries(name, data) {
    let last;
    for (let i = 0; i < TRIES_AT_A_PIECE; i += 1) {
      try { await put(name, data); return; } catch (err) { last = err; if (i < TRIES_AT_A_PIECE - 1) await sleep(retryMs[i] ?? 0); }
    }
    throw last;
  }

  // A file over 10 MB, sent a piece at a time while the pass goes on. The
  // pieces are read one by one, so 200 MB never sits in memory.
  function startUpload(ref, found, at) {
    const task = { key: `${found.file}|${found.size}`, done: false, entry: null, error: null };
    const total = pieceSizes(found.size).length;
    const base = safeName(found.file);
    const progress = (done) => noting({ ref, mine: true, coming: true, here: found.file, done, total, at });
    progress(0);
    task.promise = (async () => {
      const fd = fs.openSync(found.file, 'r');
      try {
        const whole = crypto.createHash('sha256');
        const chunks = [];
        for (const [i, length] of pieceSizes(found.size).entries()) {
          const buf = Buffer.alloc(length);
          let read = 0;
          while (read < length) {
            const got = fs.readSync(fd, buf, read, length - read, i * PART_BYTES + read);
            if (!got) throw new Error('the file got shorter while it was sent');
            read += got;
          }
          whole.update(buf);
          const cloud = `${sumOf(buf)}-${base.slice(-100)}.p${i + 1}of${total}`;
          const there = await has([cloud]);
          if (!there.includes(cloud)) await putWithRetries(cloud, buf.toString('base64'));
          chunks.push({ cloud, size: length });
          progress(i + 1);
        }
        const name = base;
        const main = plainPartPath(name) ? name : `file${path.extname(name)}`;
        task.entry = { ref, main, parts: [{ path: main, cloud: `${whole.digest('hex').slice(0, 12)}-${base}`, size: found.size, chunks }], at };
      } catch (err) {
        log(`team files: sending ${ref} in parts: ${err?.message ?? err}`);
        task.error = 'upload';
      } finally {
        fs.closeSync(fd);
        task.done = true;
      }
    })();
    return task;
  }

  function bigSend(ref, found, at) {
    let task = uploads.get(ref);
    if (task && task.key !== `${found.file}|${found.size}`) { uploads.delete(ref); task = null; }
    if (!task) { task = startUpload(ref, found, at); uploads.set(ref, task); }
    if (!task.done) return { sent: false, working: true };
    uploads.delete(ref);
    if (task.error) {
      noting({ ref, mine: true, failed: true, why: task.error, here: found.file, at });
      return { sent: true, failed: true };
    }
    noting({ ...task.entry, mine: true, here: found.file });
    return { entry: task.entry, sent: true };
  }

  const chunkCount = (entry, part) => part.chunks.filter((c) => fs.existsSync(chunkFile(dir, entry, part, c))).length;

  // Every piece of a big part, then the part itself put back together and
  // checked against the name the sender gave the whole. True when it is here.
  async function gatherPart(entry, part) {
    const missing = part.chunks.filter((c) => !fs.existsSync(chunkFile(dir, entry, part, c)));
    if (missing.length) {
      const there = new Set(await has(missing.map((c) => c.cloud)));
      for (const c of missing.filter((m) => there.has(m.cloud))) {
        const data = await get(c.cloud);
        if (typeof data !== 'string') continue;
        const bytes = Buffer.from(data, 'base64');
        if (bytes.length > MAX_CARRIED_BYTES || !c.cloud.startsWith(`${sumOf(bytes)}-`)) { log(`team files: ${c.cloud} did not match its name`); continue; }
        const to = chunkFile(dir, entry, part, c);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        const tmp = `${to}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, bytes);
        fs.renameSync(tmp, to);
      }
    }
    if (chunkCount(entry, part) < part.chunks.length) return false;
    const to = partFile(dir, entry, part);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const tmp = `${to}.${process.pid}.tmp`;
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(tmp, 'w');
    try {
      for (const c of part.chunks) {
        const bytes = fs.readFileSync(chunkFile(dir, entry, part, c));
        hash.update(bytes);
        fs.writeSync(fd, bytes);
      }
    } finally { fs.closeSync(fd); }
    const right = part.cloud.startsWith(`${hash.digest('hex').slice(0, 12)}-`);
    if (right) fs.renameSync(tmp, to); else fs.rmSync(tmp, { force: true });
    for (const c of part.chunks) fs.rmSync(chunkFile(dir, entry, part, c), { force: true });
    if (!right) throw Object.assign(new Error(`${part.cloud} did not match its name once put together`), { damaged: true });
    return true;
  }

  function startGathering(entry, part) {
    const key = `${entryKey(entry)}/${part.path}`;
    if (downloads.has(key) || givenUp.has(key)) return;
    const before = chunkCount(entry, part);
    const spoilt = () => { givenUp.add(key); shelve(dir, [{ ...entry, damaged: true }], { fs }); };
    const run = (async () => {
      let whole = false;
      try { whole = await gatherPart(entry, part); } catch (err) {
        log(`team files: putting ${part.cloud} together: ${err?.message ?? err}`);
        if (err?.damaged) return spoilt();
      }
      if (whole) return;
      const stuck = chunkCount(entry, part) <= before ? (rounds.get(key) ?? 0) + 1 : 0;
      rounds.set(key, stuck);
      if (stuck >= ROUNDS_WITHOUT_A_PIECE) spoilt();
    })().finally(() => downloads.delete(key));
    downloads.set(key, run);
  }

  async function takeParts(entry) {
    const missing = (entry.parts ?? []).filter((p) => !fs.existsSync(partFile(dir, entry, p)));
    if (!missing.length) return true;
    for (const part of missing.filter((p) => p.chunks)) startGathering(entry, part);
    const small = missing.filter((p) => !p.chunks);
    if (small.length) {
      const there = new Set(await quietly('asking', () => has(small.map((p) => p.cloud)), []));
      for (const part of small.filter((p) => there.has(p.cloud))) {
        const data = await quietly(`taking ${part.cloud}`, () => get(part.cloud), null);
        if (typeof data !== 'string') continue;
        const bytes = Buffer.from(data, 'base64');
        if (bytes.length > MAX_CARRIED_BYTES) continue;
        if (!part.cloud.startsWith(`${sumOf(bytes)}-`)) { log(`team files: ${part.cloud} did not match its name`); continue; }
        await quietly(`saving ${part.cloud}`, () => store(entry, part, bytes));
      }
    }
    return (entry.parts ?? []).every((p) => fs.existsSync(partFile(dir, entry, p)));
  }

  return {
    /**
     * Answers `{ sent, entry, looking, working, failed }`. `sent` false means
     * the cloud did not take it (or a big file is still going up) and the
     * caller asks again. `looking`: nothing found yet, and the caller may look
     * again for a while. `entry` is what the readers are handed, when there is
     * something to say; a bare word with nothing behind it hands them a quiet
     * one, so their tile never waits for it.
     */
    async send(ref, { meant = false, final = false } = {}) {
      const at = now();
      const going = uploads.get(ref);
      if (going && !going.done) return { sent: false, working: true };
      const found = await find(ref, { meant });
      if (!found?.file) {
        const why = found?.none ?? 'missing';
        if (!meant) {
          const entry = { ref, quiet: true, at };
          noting({ ...entry, mine: true });
          return { entry, sent: true, looking: why === 'missing' };
        }
        if (why === 'missing' && !final) {
          noting({ ref, mine: true, coming: true, at });
          return { sent: true, looking: true };
        }
        const entry = { ref, cannot: true, why, at };
        noting({ ...entry, mine: true });
        return { entry, sent: true };
      }
      if (found.size > MAX_SENT_BYTES) {
        const entry = { ref, tooBig: found.size, at };
        noting({ ...entry, mine: true, here: found.file });
        return { entry, sent: true };
      }
      const read = partsOf(found, fs);
      if (read[0].big) return bigSend(ref, found, at);
      if (!read.every((p) => plainPartPath(p.path))) {
        const entry = { ref, cannot: true, why: 'name', at };
        noting({ ...entry, mine: true });
        return { entry, sent: true };
      }
      noting({ ref, mine: true, coming: true, here: found.file, at });
      const main = read[0].path;
      const parts = read.map((p) => ({ path: p.path, cloud: cloudNameOf(p.bytes, p.file), size: p.bytes.length, bytes: p.bytes }));
      const there = await quietly('asking', () => has(parts.map((p) => p.cloud)), null);
      if (!there) return { sent: false };
      for (const part of parts.filter((p) => !there.includes(p.cloud))) {
        const went = await quietly(`sending ${part.cloud}`, async () => { await put(part.cloud, part.bytes.toString('base64')); return true; }, false);
        if (!went) return { sent: false };
      }
      const entry = { ref, main, parts: parts.map(({ bytes, ...p }) => p), at };
      for (const part of parts) store(entry, part, part.bytes);
      shelve(dir, [{ ...entry, mine: true, here: found.file }], { fs });
      return { entry, sent: true };
    },

    /** Gives up on a file for good, and says why on the sender's own tile. */
    giveUp(ref, why = 'upload') {
      const was = shelvedEntries(dir, { fs }).find((e) => e.ref === ref);
      noting({ ref, mine: true, failed: true, why, ...(was?.here ? { here: was.here } : {}), at: now() });
    },

    /** A teammate's words name a file whose list has not come: remembered, so its tile can say so. */
    expect(ref, by, at) {
      if (shelvedEntries(dir, { fs }).some((e) => e.ref === ref)) return;
      shelve(dir, [{ ref, expecting: true, by, at }], { fs });
    },

    /** Forgets a failed try, so the next send starts clean. */
    forget(ref) {
      uploads.delete(ref);
    },

    async take(rawEntries) {
      const entries = rawEntries.map(validEntry).filter(Boolean);
      if (!entries.length) return;
      for (const entry of entries) if (entry.parts) await takeParts(entry);
      shelve(dir, entries, { fs });
    },

    async takeMissing() {
      for (const entry of shelvedEntries(dir, { fs })) {
        if (entry.parts && !entry.damaged && validEntry(entry)) await takeParts(entry);
      }
    },

    /** Resolves when every upload and download going on in the background has ended. */
    async settled() {
      for (;;) {
        const running = [...[...uploads.values()].filter((t) => !t.done).map((t) => t.promise), ...downloads.values()];
        if (!running.length) return;
        await Promise.allSettled(running);
      }
    },
  };
}

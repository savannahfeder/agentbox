// THIS COMPUTER'S END OF THE VERSION LINE (shared/version-line.mjs).
//
// `add` hashes a file, keeps its bytes as they are now, and asks the holder for
// the number of those bytes: the team cloud when the file is shared with a
// team, this computer otherwise. The kept copy is what lets a write over a path
// be the next version while the one before still opens.
//
// With the cloud out of reach a version is numbered after the line as this
// computer last read it and marked `pending`; the next pass asks again, so the
// number it shows is the cloud's once the cloud answers. The Files list waits
// on these asks, so it waits a moment at most, one ask is out at a time, and a
// cloud that failed is left alone for a while.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appendTo, cleanEntry, foldLine } from '../shared/version-line.mjs';

const LINE = 'version-line.jsonl';
const HASHES = 'version-hashes.json';
const HASHES_AFTER_MS = 2000;
const RACY_MS = 2000;
const BYTES = 'version-bytes';
// A film past this stays a version but is not copied.
const KEEP_UP_TO = 512 * 1024 * 1024;
const ASK_WAIT_MS = 2000;
// An ask still out after this is given up, so one stuck request cannot stop every later one.
const ASK_GIVE_UP_MS = 60_000;
const OUT_FIRST_MS = 60_000;
const OUT_MOST_MS = 30 * 60_000;

export const lineId = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 40);
const safeName = (name) => String(name ?? 'file').replace(/[^\w.-]+/g, '-').slice(-120) || 'file';

export function versionLine({ dir, cloud = () => null, onMoved = () => {} }) {
  const file = path.join(dir, LINE);
  const hashFile = path.join(dir, HASHES);
  let entries = [];
  try {
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
      try { const e = l && JSON.parse(l); if (cleanEntry(e)) entries.push(e); } catch { /* a line cut short by a crash */ }
    }
  } catch { /* none yet */ }
  // Kept beside the line, so a restart does not read every file again.
  let hashes = new Map();
  try { hashes = new Map(Object.entries(JSON.parse(fs.readFileSync(hashFile, 'utf8')))); } catch { /* none yet */ }
  // file id -> hash -> the ask: thousands can wait on a cloud that never answers.
  const pending = new Map();
  let queue = Promise.resolve();

  const writeWhole = (to, text) => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${to}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, to);
  };
  const append = (e) => { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(e)}\n`); };
  let hashTimer = null;
  const saveHashesSoon = () => {
    hashTimer ??= setTimeout(() => {
      hashTimer = null;
      try { writeWhole(hashFile, JSON.stringify(Object.fromEntries(hashes))); } catch (err) { console.warn(`version line: ${err.message}`); }
    }, HASHES_AFTER_MS);
    hashTimer.unref?.();
  };

  async function hashOf(src) {
    const st = await fs.promises.stat(src, { bigint: true }).catch(() => null);
    if (!st?.isFile()) return null;
    const size = Number(st.size);
    const mtime = Number(st.mtimeMs);
    // A disk stamps times coarsely, so two writes of one size close together
    // can carry one time. A hash taken while the file was that fresh is not
    // trusted again, as git does; an older file's is. A kept entry from before has no `seen`.
    const ns = String(st.mtimeNs);
    const was = hashes.get(src);
    const settled = was && (was.seen == null || was.seen - was.mtime > RACY_MS);
    if (was && settled && was.size === size && was.mtime === mtime && (was.ns == null || was.ns === ns)) return was;
    const hash = await new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      fs.createReadStream(src).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
    }).catch(() => null);
    if (!hash) return null;
    const out = { size, mtime, ns, seen: Date.now(), hash };
    hashes.set(src, out);
    saveHashesSoon();
    return out;
  }

  const keptDir = (hash) => path.join(dir, BYTES, hash);
  const kept = new Map();
  function keptOf(hash) {
    if (kept.has(hash)) return kept.get(hash);
    let found = null;
    try { const [name] = fs.readdirSync(keptDir(hash)).filter((n) => !n.endsWith('.tmp')); found = name ? path.join(keptDir(hash), name) : null; } catch { /* not kept */ }
    if (found) kept.set(hash, found);
    return found;
  }
  function keep(src, { hash, size }, name) {
    if (keptOf(hash) || size > KEEP_UP_TO) return;
    try {
      fs.mkdirSync(keptDir(hash), { recursive: true });
      const to = path.join(keptDir(hash), safeName(name));
      // A clone where the disk can make one, so keeping a film costs no space.
      fs.copyFileSync(src, `${to}.tmp`, fs.constants.COPYFILE_FICLONE);
      fs.renameSync(`${to}.tmp`, to);
    } catch (err) { console.warn(`version line: could not keep ${name}: ${err.message}`); }
  }

  const shown = (e) => { const at = keptOf(e.hash); return at ? { ...e, kept: at } : { ...e }; };
  let folded = null;
  const lineOf = (id) => (folded ??= foldLine(entries)).get(id) ?? [];

  /** Every version of `file`, oldest first, numbered by the line. */
  function of(key) {
    const id = lineId(key);
    const line = lineOf(id);
    const waiting = [...(pending.get(id)?.values() ?? [])].filter((p) => !line.some((v) => v.hash === p.hash));
    const last = Math.max(0, ...line.map((v) => v.n));
    return [...line, ...waiting.map((p, i) => ({ ...p, n: last + i + 1, pending: true }))].map(shown);
  }

  let asking = null;
  let outUntil = 0;
  let outFor = 0;
  /** The cloud's number for `asked`, or null when it failed or took too long. */
  function askCloud(holder, asked) {
    let giveUp;
    const tooLong = new Promise((_, no) => { giveUp = setTimeout(() => no(new Error('the cloud took too long to number a version')), ASK_GIVE_UP_MS); giveUp.unref?.(); });
    const answer = Promise.race([Promise.resolve().then(() => holder.append(asked)), tooLong]).then((got) => {
      const row = cleanEntry(got);
      if (!row) throw new Error('the cloud gave no number');
      outFor = 0;
      if (!lineOf(row.file).some((v) => v.hash === row.hash)) {
        entries.push(row);
        folded = null;
        append(row);
      }
      pending.get(asked.file)?.delete(asked.hash);
      return shown(row);
    }, (err) => {
      console.warn(`version line: ${err.message}`);
      outFor = Math.min(outFor ? outFor * 2 : OUT_FIRST_MS, OUT_MOST_MS);
      outUntil = Date.now() + outFor;
      return null;
    }).finally(() => { clearTimeout(giveUp); if (asking === answer) asking = null; });
    asking = answer;
    return answer;
  }

  async function addNow({ file: key, src, name, by = null, at = Date.now(), shared = true }) {
    const bytes = await hashOf(src);
    if (!bytes) return null;
    const id = lineId(key);
    const had = lineOf(id).find((v) => v.hash === bytes.hash);
    if (had) { keep(src, bytes, name); return shown(had); }
    keep(src, bytes, name);
    const asked = { file: id, hash: bytes.hash, name: lineId(name), by, at };
    const holder = shared ? cloud() : null;
    if (holder) {
      if (!pending.has(id)) pending.set(id, new Map());
      pending.get(id).set(bytes.hash, asked);
      if (!asking && Date.now() >= outUntil) {
        const answer = askCloud(holder, asked);
        let wait;
        const LATE = {};
        const got = await Promise.race([answer, new Promise((resolve) => { wait = setTimeout(() => resolve(LATE), ASK_WAIT_MS); wait.unref?.(); })]);
        clearTimeout(wait);
        if (got === LATE) answer.then((row) => { if (row) onMoved(); });
        else if (got) return got;
      }
      return of(key).find((v) => v.hash === bytes.hash) ?? null;
    }
    const { entry } = appendTo(lineOf(id), asked);
    entries.push({ ...entry, local: true });
    folded = null;
    append({ ...entry, local: true });
    return shown(entry);
  }

  return {
    of,
    /** One at a time, so two versions of one file never take the same number here. */
    add(p) {
      const run = queue.then(() => addNow(p));
      queue = run.catch(() => {});
      return run;
    },
    /** The cloud's line, read again; true when it moved. What only this computer holds stays. */
    async refresh() {
      const holder = cloud();
      if (!holder) return false;
      const rows = (await holder.read()).map(cleanEntry).filter(Boolean);
      const was = JSON.stringify(entries);
      entries = [...entries.filter((e) => e.local), ...rows];
      folded = null;
      if (JSON.stringify(entries) === was) return false;
      writeWhole(file, entries.map((e) => `${JSON.stringify(e)}\n`).join(''));
      return true;
    },
    hashOf,
    idOf: lineId,
  };
}

// Work items on disk: append-only jsonl, one file per product, folded on read.
//
// The rules live in shared/work-items.mjs (pure, browser-safe, imported by the
// UI too). This file is the disk half, and it is the ONLY write path: the MCP
// server and the app's main process both come through here rather than each
// inventing their own append. That is deliberate. Two writers that agree about
// the fold but disagree about how a line reaches the file is exactly how a
// substrate stops being trustworthy.
//
// Every answer is derived from the file, because at any moment there may be a
// dozen server processes reading it. The one thing held between calls is a fold
// of a file that has not moved, keyed on the file's own identity, and the note
// beside `foldedLedger` says why that is still the same answer.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { machineryPath } from './home.mjs';
import { withProjectLock } from './project-lock.mjs';
import {
  foldWorkItems, foldRawInto, finishItem, normalizeLine, buildLine, buildClaimLine, buildHeartbeatLine, buildReleaseLine,
  isClaimable, sortForPull, matchesFilter, isWorkItemId, MAX_LINE_BYTES, LEASE_MS,
} from '../../shared/work-items.mjs';

const LEDGER = 'work-items.jsonl';
// Never load an unbounded jsonl into memory: past this, read only the trailing
// window. The fold tolerates the torn leading line that produces, exactly as
// records.mjs and the chat log already do.
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const warnedOversize = new Set();

// THE LEDGER LIVES IN THE APP'S HOME, NOT IN THE FOLDER SHE UPLOADS FILES TO.
// It used to be `<product>/work-items.jsonl`, and on a product with no code repo
// registered that folder is the worker's own working directory. main/store/home.mjs
// says why it moved and moves the old file in the first time this is called.
function ledgerPath(projectDir) {
  return machineryPath(projectDir, LEDGER);
}

/* --------------------------------- writing ------------------------------- */
// ONE writeSync of ONE buffer onto an O_APPEND fd, with the byte count checked.
//
// This is the whole reason torn lines are rare in practice and would not be if
// written casually: O_APPEND makes the offset-seek and the write a single atomic
// step against other appenders, but only for one write call. A line assembled
// from several writes can interleave with another process's line between them,
// and the result is two corrupted records rather than one. A short write means
// the guarantee did not hold, so it throws rather than leaving a half line for
// the fold to skip and the founder to never hear about.
// WHO IS WRITING, on a Mac someone has signed in on (the team version).
//
// Main sets it on sign-in. The store's MCP server is another process, so it
// reads AGENTBOX_PERSON_ID, which the supervisor hands it. With neither, no line
// is stamped and the single-person app writes exactly what it always wrote.
let lineAuthor = null;
export function setLineAuthor(personId) {
  lineAuthor = typeof personId === 'string' && personId ? personId : null;
}
function currentAuthor() {
  return lineAuthor ?? (process.env.AGENTBOX_PERSON_ID || null);
}
const newLineUid = () => `l-${crypto.randomBytes(8).toString('hex')}`;

function appendLine(file, obj) {
  const author = currentAuthor();
  // `by` and `uid` are added here, the one place every line passes, so no
  // writer can forget them. A line that already carries them keeps its own.
  const line = author ? { ...obj, by: obj.by ?? author, uid: obj.uid ?? newLineUid() } : obj;
  return writeLine(file, line);
}

function writeLine(file, obj) {
  const buf = Buffer.from(JSON.stringify(obj) + '\n', 'utf8');
  if (buf.length > MAX_LINE_BYTES) throw new Error(`work item line too large (${buf.length} bytes, max ${MAX_LINE_BYTES})`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'a');
  try {
    const written = fs.writeSync(fd, buf, 0, buf.length);
    if (written !== buf.length) throw new Error(`short append (${written} of ${buf.length} bytes) writing ${file}`);
  } finally {
    fs.closeSync(fd);
  }
  return obj;
}

/* --------------------------------- reading ------------------------------- */
function readLines(file) {
  let text;
  try {
    const size = fs.statSync(file).size;
    if (size > MAX_LEDGER_BYTES) {
      if (!warnedOversize.has(file)) {
        warnedOversize.add(file);
        console.warn(`work-items: ${file} is ${size} bytes; reading only the last ${MAX_LEDGER_BYTES}`);
      }
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.allocUnsafe(MAX_LEDGER_BYTES);
        const read = fs.readSync(fd, buf, 0, MAX_LEDGER_BYTES, size - MAX_LEDGER_BYTES);
        text = buf.toString('utf8', 0, read);
      } finally {
        fs.closeSync(fd);
      }
    } else {
      text = fs.readFileSync(file, 'utf8');
    }
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return text.split('\n').filter((l) => l && Buffer.byteLength(l, 'utf8') <= MAX_LINE_BYTES);
}

/* --------------------------- the fold, kept warm -------------------------- */
// THE INBOX REFOLDS EVERY LEDGER SHE OWNS SEVERAL TIMES A SECOND, and that was
// the lag. Measured on her Mac, 2026-09-19: the app's snapshot calls
// `readWorkItems` once per project, 33 of them, over 21 MB of jsonl, and the
// renderer refetches that snapshot on every push while a worker streams, which
// is one push every 400 ms. Median cost of the fold alone: 232 ms of
// synchronous work on the thread that also draws her window. The main process
// sat at 69% of a core with nobody touching the app, and every click had to
// wait its turn behind a 232 ms block.
//
// Nothing in that work is new. A streaming worker writes to the ledger once a
// minute at most, so the same 22,990 lines were being read off disk and parsed
// again for an answer that had not changed.
//
// SO THE FOLD IS KEPT, KEYED ON THE FILE'S OWN IDENTITY: inode, byte length and
// modification time. The ledger is append-only through `appendLine` above, so
// any write at all moves the length, and a write from ANOTHER process moves it
// just the same. That is what makes this safe across the dozen readers the
// header talks about: the key is a property of the file on disk, not a belief
// this process holds about it. A miss costs exactly what every call used to.
//
// THE CACHED FOLD IS UN-AGED, and that is the subtle part. `foldWorkItems`
// finishes by expiring leases against `now`, which is the one thing in the
// answer that changes while the file does not. So the cache is folded at time
// zero, where no lease has lapsed yet, and every caller gets a copy aged
// against its own `now` (`aged` below). Handing out the cached objects
// themselves would let one caller's edit become every later caller's truth.
const folded = new Map();
const MAX_FOLDS_HELD = 64;
const REWINDOW_BYTES = 2 * 1024 * 1024;

// A STAMP OF SIZE AND TIME CANNOT TELL A REPLACED LEDGER FROM AN UNTOUCHED ONE,
// so the file that was folded is held open.
//
// What broke (2026-10-19, on GitHub's Linux runner): a ledger deleted and
// written again at the same length answered with the fold of the old one.
// Deleting it freed its inode number for the new file to take, and the clock
// that filesystem stamps a write with is coarse enough that both writes landed
// on one mtime, so all three parts of the stamp matched. On APFS the two writes
// get different nanoseconds, which is why no Mac ever saw it.
//
// An open descriptor settles it: while one is held, that inode number cannot be
// given to another file, so a number we do not recognise means a different
// file. The generation below carries that into the stamp, so a replaced ledger
// is read from the start by every cache keyed on it, not just the fold.
const pinned = new Map();
const MAX_PINS = 64;
let generations = 0;

function dropPin(file) {
  const pin = pinned.get(file);
  if (!pin) return;
  pinned.delete(file);
  try { fs.closeSync(pin.fd); } catch { /* already gone */ }
}

function ledgerPin(file) {
  const absent = { stamp: 'absent', st: null, fd: null, gen: 0 };
  let st = null;
  try { st = fs.statSync(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (!st) { dropPin(file); return absent; }
  let pin = pinned.get(file);
  if (!pin || pin.ino !== st.ino) {
    dropPin(file);
    let fd;
    try { fd = fs.openSync(file, 'r'); } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return absent;
    }
    // The file that ended up held, which is a different one from the stat above
    // if it was replaced between the two calls.
    st = fs.fstatSync(fd);
    generations += 1;
    if (pinned.size >= MAX_PINS) dropPin(pinned.keys().next().value);
    pin = { fd, ino: st.ino, gen: generations };
    pinned.set(file, pin);
  }
  return { stamp: `${pin.gen}:${st.size}:${st.mtimeMs}`, st, fd: pin.fd, gen: pin.gen };
}

function ledgerStamp(file) {
  return ledgerPin(file).stamp;
}

const usable = (l) => l && Buffer.byteLength(l, 'utf8') <= MAX_LINE_BYTES;

// A ledger that has only grown is folded on from where it was: every running
// agent's heartbeat changes the file, and folding all 8 MB again each time
// held up every request the window made. A file that shrank, was replaced, or
// changed without growing is read from the start.
function foldedLedger(file) {
  const pin = ledgerPin(file);
  const st = pin.st;
  const held = folded.get(file);
  if (held && held.stamp === pin.stamp) return held.items;
  // While it still holds no more than the 8 MB a fresh read would, give or
  // take REWINDOW_BYTES added since: a fold kept much longer would show
  // threads a fresh read cuts off.
  const inWindow = held && st && (held.from === 0 ? st.size <= MAX_LEDGER_BYTES : st.size - held.from <= MAX_LEDGER_BYTES + REWINDOW_BYTES);
  if (held && st && held.gen === pin.gen && st.size > held.offset && held.raw && inWindow) {
    const buf = Buffer.allocUnsafe(st.size - held.offset);
    const n = fs.readSync(pin.fd, buf, 0, buf.length, held.offset);
    // Whole lines only, by the byte: a line still being written waits for
    // the next read rather than being cut through a character.
    const end = n ? buf.lastIndexOf(0x0a, n - 1) + 1 : 0;
    const chunk = buf.toString('utf8', 0, end);
    held.offset += end;
    const touched = new Set();
    foldRawInto(held.raw, chunk.split('\n').filter(usable), touched);
    // Only threads new to this fold or reopened in it: the rest were looked at
    // already, and one with no title anywhere would be read for on every line.
    if (held.from > 0) {
      const was = (id) => held.items.get(id);
      const arrived = [...touched].filter((id) => !was(id) || was(id).status === 'done');
      restoreCutHeads(held.raw, arrived, pin.fd, held.from, held.offset);
    }
    for (const id of touched) held.items.set(id, finishItem(held.raw.get(id), 0));
    held.stamp = pin.stamp;
    return held.items;
  }
  // Time zero, so the lease pass inside the fold expires nothing: a lease is
  // only ever lapsed against the clock of the call asking, and that is `aged`.
  const raw = new Map();
  let offset = 0;
  let from = 0;
  if (st) {
    const read = readWindow(file, st.size, pin.fd);
    foldRawInto(raw, read.text.split('\n').filter(usable));
    if (read.from > 0) restoreCutHeads(raw, raw.keys(), pin.fd, read.from, read.end);
    offset = read.end;
    from = read.from;
  }
  const items = new Map();
  for (const [id, item] of raw) items.set(id, finishItem(item, 0));
  // One entry per ledger, so a real store has a few dozen. The cap is for the
  // long-lived MCP server, which walks temporary project dirs that never come
  // back; a Map iterates in insertion order, so the oldest key goes first.
  if (folded.size >= MAX_FOLDS_HELD) folded.delete(folded.keys().next().value);
  folded.set(file, { stamp: pin.stamp, items, raw, gen: pin.gen, offset, from });
  return items;
}

// The ledger's trailing window, as text, to its last whole line, and the byte
// that ends at, read through the descriptor the fold holds open.
function readWindow(file, size, fd) {
  if (size > MAX_LEDGER_BYTES && !warnedOversize.has(file)) {
    warnedOversize.add(file);
    console.warn(`work-items: ${file} is ${size} bytes; reading only the last ${MAX_LEDGER_BYTES}`);
  }
  const from = Math.max(0, size - MAX_LEDGER_BYTES);
  const buf = Buffer.allocUnsafe(size - from);
  const n = fs.readSync(fd, buf, 0, buf.length, from);
  const end = n ? buf.lastIndexOf(0x0a, n - 1) + 1 : 0;
  return { text: buf.toString('utf8', 0, end), end: from + end, from };
}

// AN UNFINISHED THREAD WHOSE FIRST LINE IS BEFORE THE WINDOW is folded from its
// later lines alone: no title, so a blank row in the inbox. A title is written
// once, by the line that makes a thread, so no title means the cut went through
// it, and its own lines are read from the start of the file and folded again.
// A finished one is left to `readOlderWorkItems`, so a ledger without such a
// thread is read exactly as it always was.
//
// THE CLAIM STAYS THE WINDOW'S. `claimWorkItem` numbers a claim from the window,
// so one made after the cut can be lower than one before it, and the older one
// would fence off everything its agent wrote since.
function restoreCutHeads(raw, ids, fd, from, end) {
  const cut = new Set();
  for (const id of ids) {
    const item = raw.get(id);
    if (!item.wrote.title && item.status !== 'done') cut.add(id);
  }
  if (!cut.size) return;
  const lines = linesUpTo(fd, end, cut);
  const restored = new Map();
  foldRawInto(restored, lines.filter((l) => l.at < from).map((l) => l.text));
  const found = [...restored.keys()].filter((id) => cut.has(id));
  for (const id of found) Object.assign(restored.get(id), { epoch: 0, claim: null });
  foldRawInto(restored, lines.filter((l) => l.at >= from).map((l) => l.text));
  for (const id of found) raw.set(id, restored.get(id));
}

// The whole lines before byte `end` that carry one of `ids`, with the byte each
// starts at, read a megabyte at a time. Searched as bytes, so a line that is
// not one of them is never decoded; the fold checks whose each line really is.
const PIECE_BYTES = 1024 * 1024;
const ID_KEY = Buffer.from('"id":"');
function linesUpTo(fd, end, ids) {
  const out = [];
  let rest = Buffer.alloc(0);
  let restAt = 0;
  for (let pos = 0; pos < end;) {
    const buf = Buffer.allocUnsafe(Math.min(PIECE_BYTES, end - pos));
    const n = fs.readSync(fd, buf, 0, buf.length, pos);
    if (!n) break;
    pos += n;
    const bytes = rest.length ? Buffer.concat([rest, buf.subarray(0, n)]) : buf.subarray(0, n);
    const whole = bytes.lastIndexOf(0x0a) + 1;
    const starts = new Set();
    for (let at = bytes.indexOf(ID_KEY); at !== -1 && at < whole; at = bytes.indexOf(ID_KEY, at + ID_KEY.length)) {
      const from = at + ID_KEY.length;
      if (ids.has(bytes.toString('latin1', from, bytes.indexOf(0x22, from)))) starts.add(bytes.lastIndexOf(0x0a, at) + 1);
    }
    for (const start of starts) {
      const text = bytes.toString('utf8', start, bytes.indexOf(0x0a, start));
      if (usable(text)) out.push({ text, at: restAt + start });
    }
    rest = bytes.subarray(whole);
    restAt += whole;
  }
  return out;
}

// One item as of `now`: a copy, with the lease rule that `foldWorkItems` applies
// at the end of its own pass applied here instead. The two mutable fields a
// caller can reach through a spread are copied with it.
function aged(item, now) {
  const claimExpired = !!(item.claim && item.claim.leaseUntil < now);
  const out = {
    ...item,
    labels: Array.isArray(item.labels) ? [...item.labels] : item.labels,
    wrote: { ...item.wrote },
    claim: item.claim ? { ...item.claim } : item.claim,
    claimExpired,
  };
  if (out.status === 'claimed' && (!out.claim || claimExpired)) out.status = 'open';
  return out;
}

/** Every work item in one product, folded. */
export function readWorkItems(projectDir, now = Date.now()) {
  const out = [];
  for (const item of foldedLedger(ledgerPath(projectDir)).values()) out.push(aged(item, now));
  return out;
}

/**
 * THE FINISHED THREADS THE 8 MB READ CUT OFF, read only when somebody asks.
 *
 * `readLines` keeps a ledger's trailing 8 MB, so a thread whose lines all came
 * before that is in no fold, and one whose first lines did is folded without
 * them (a blank title, the wrong `createdAt`). Measured 2026-10-07
 * (w-fda2165ec6): 155 finished threads gone and 21 blank on one 12.8 MB
 * ledger. Her call was that these load as she scrolls rather than up front, so
 * the snapshot keeps its window and this reads the whole file, once per
 * change of the file, for the Done and All tabs' next page.
 *
 * Finished threads only: this is history, and it is where the tabs that ask
 * for it go. A ledger that fits in the window has nothing to give.
 */
const wholeFolds = new Map();
export function readOlderWorkItems(projectDir, now = Date.now()) {
  const file = ledgerPath(projectDir);
  let size;
  try { size = fs.statSync(file).size; } catch { return []; }
  if (size <= MAX_LEDGER_BYTES) return [];
  const stamp = ledgerStamp(file);
  let whole = wholeFolds.get(file);
  if (!whole || whole.stamp !== stamp) {
    let lines;
    try { lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l && Buffer.byteLength(l, 'utf8') <= MAX_LINE_BYTES); } catch { return []; }
    // Few ledgers are ever this big; hold the latest fold of each, no more.
    if (wholeFolds.size >= 8) wholeFolds.delete(wholeFolds.keys().next().value);
    whole = { stamp, items: foldWorkItems(lines, 0) };
    wholeFolds.set(file, whole);
  }
  const windowed = foldedLedger(file);
  const out = [];
  for (const item of whole.items.values()) {
    if (item.status !== 'done') continue;
    const seen = windowed.get(item.id);
    // In the window whole: the snapshot already has it right.
    if (seen && seen.createdAt === item.createdAt) continue;
    out.push(aged(item, now));
  }
  return out;
}

/** One work item, or null. */
export function readWorkItem(projectDir, id, now = Date.now()) {
  if (!isWorkItemId(id)) return null;
  const item = foldedLedger(ledgerPath(projectDir)).get(id);
  return item ? aged(item, now) : null;
}

/**
 * ONE THREAD'S LINES, OLDEST FIRST, without the lease lines (heartbeats and
 * releases), the last `max` of them.
 *
 * The phone pass (main/phone-inbox.mjs) asks this for every thread of a
 * project, up to 300, and each ask used to read and parse the whole ledger:
 * 20,929 ms of blocked main thread on the real 17,797-line agentbox-team
 * ledger, against 101 ms for one read (2026-10-14, the endless beachball). So
 * the ledger is read once per change of the file, grouped by thread, and kept,
 * keyed on the file's identity exactly as the fold is. The lines handed out are
 * the kept ones, frozen, so no caller can edit what the next one reads.
 */
const histories = new Map();
const HISTORIES_HELD = 8;
function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}
function historiesOf(file) {
  const stamp = ledgerStamp(file);
  const held = histories.get(file);
  if (held && held.stamp === stamp) return held.byId;
  const byId = new Map();
  if (stamp !== 'absent') {
    for (const raw of readLines(file)) {
      let line;
      try { line = JSON.parse(raw); } catch { continue; }
      if (!line || typeof line.id !== 'string' || line.heartbeat || line.release) continue;
      let list = byId.get(line.id);
      if (!list) byId.set(line.id, (list = []));
      list.push(deepFreeze(line));
    }
  }
  histories.delete(file);
  if (histories.size >= HISTORIES_HELD) histories.delete(histories.keys().next().value);
  histories.set(file, { stamp, byId });
  return byId;
}
// `before` keeps the lines written at or before that moment, and the cap then
// counts back from there rather than from the newest line.
export function readItemHistory(projectDir, id, { max = 400, before } = {}) {
  const lines = historiesOf(ledgerPath(projectDir)).get(id);
  if (!lines) return [];
  const upTo = Number.isFinite(before) ? lines.filter((l) => l.ts <= before) : lines;
  return upTo.slice(-max);
}

/* -------------------------------- mutating ------------------------------- */
export function newWorkItemId() {
  return `w-${crypto.randomBytes(5).toString('hex')}`;
}

/**
 * Create a work item. A plain append: no lock, because there is no read to
 * modify and the id is fresh, so there is nothing to race against.
 */
export function createWorkItem(projectDir, { title, ...rest } = {}, { source = 'agent', now = Date.now() } = {}) {
  if (!title || typeof title !== 'string' || !title.trim()) throw new Error('a work item needs a title');
  const id = newWorkItemId();
  appendLine(ledgerPath(projectDir), buildLine({ id, patch: { title, status: 'open', ...rest }, source, now }));
  return readWorkItem(projectDir, id, now);
}

/**
 * Create a work item under a CALLER-CHOSEN id, only if it does not exist yet.
 *
 * The caller is the app serving a repeating task's period, where the id is derived
 * from the rule and the date so that two writers racing describe the same item
 * rather than two rows nothing can merge.
 *
 * Why the absence check and not simply a create with a fixed id: a create append
 * writes `status: 'open'`, and the fold hands a field to the later line between
 * equal authorities. Replaying a create after that run had finished would reopen
 * a completed item and strip the labels that kept it out of the founder's inbox.
 *
 * TAKE THE PROJECT LOCK AROUND THIS. The read and the append are not atomic
 * together. It does not lock itself because its caller has more to write in the
 * same critical section, and this lock is not reentrant.
 */
export function createWorkItemIfAbsent(projectDir, id, { title, ...rest } = {}, { source = 'agent', now = Date.now() } = {}) {
  if (!isWorkItemId(id)) throw new Error(`invalid work item id: ${id}`);
  if (!title || typeof title !== 'string' || !title.trim()) throw new Error('a work item needs a title');
  const file = ledgerPath(projectDir);
  const existing = foldWorkItems(readLines(file), now).get(id);
  if (existing) return { created: false, item: existing };
  appendLine(file, buildLine({ id, patch: { title, status: 'open', ...rest }, source, now }));
  return { created: true, item: readWorkItem(projectDir, id, now) };
}

/**
 * Patch a work item. Also a plain append: the fold resolves conflicts per field,
 * so concurrent patches from different processes cannot lose each other.
 *
 * `epoch` fences an agent write. Pass the epoch the caller's claim was granted
 * under; the fold discards the line if that claim has since been superseded.
 * A founder write passes source 'founder' and no epoch, and is never fenced.
 */
export function updateWorkItem(projectDir, id, patch, { epoch = null, source = 'agent', now = Date.now() } = {}) {
  appendLine(ledgerPath(projectDir), buildLine({ id, patch, source, epoch, now }));
  return readWorkItem(projectDir, id, now);
}

/**
 * Claim a work item, or pull the next one matching a filter.
 *
 * THE ONE OPERATION THAT NEEDS THE LOCK. Everything else here is an append that
 * the fold reconciles, but claiming is read-decide-write: fold the ledger, see
 * an item unclaimed, append a claim. Two processes doing that concurrently both
 * see it unclaimed and both claim it, which is the exact failure the whole
 * design exists to prevent. So the fold and the append happen together, inside
 * the lock, and the section stays tiny.
 *
 * Returns { claimed: true, item, epoch } or { claimed: false, reason, heldBy },
 * never a throw for the ordinary case of losing a race: a worker that loses
 * should ask for the next item, not die.
 */
export async function claimWorkItem(projectDir, { id = null, filter = null, holder, leaseMs = LEASE_MS, now = Date.now() } = {}) {
  if (!holder) throw new Error('a claim needs a holder id');
  if (!id && !filter) throw new Error('claim needs either an id or a filter');
  const file = ledgerPath(projectDir);

  return withProjectLock(projectDir, async () => {
    const items = foldWorkItems(readLines(file), now);

    let target = null;
    if (id) {
      const item = items.get(id);
      if (!item) return { claimed: false, reason: 'no such work item' };
      // By id, a blocked item IS claimable: a worker sent specifically to
      // unblock something must not be refused by its own queue.
      if (item.status === 'done') return { claimed: false, reason: 'already done' };
      // A LIVE CLAIM OF YOUR OWN IS NOT SOMEBODY ELSE'S. The holder was never
      // compared here, so a session asking for the row it already holds was
      // told "held by another worker" and handed back its own name, and the
      // only way through was to sit out its own five minute lease: after a
      // reply, the session was refused by its own claim, waited out the lease,
      // and the answer the user was waiting for sat in a parked file.
      // Re-claiming what you hold is a renewal.
      if (item.claim && !item.claimExpired && item.claim.holder !== holder) {
        return { claimed: false, reason: 'held by another worker', heldBy: item.claim.holder };
      }
      target = item;
    } else {
      const candidates = sortForPull([...items.values()].filter((i) => matchesFilter(i, filter) && isClaimable(i, now)));
      if (!candidates.length) return { claimed: false, reason: 'nothing available' };
      target = candidates[0];
    }

    // The epoch always moves forward, including when breaking an expired lease.
    // That is what makes the previous holder's later writes identifiable as
    // stale rather than merely old.
    const epoch = (target.epoch ?? 0) + 1;
    appendLine(file, buildClaimLine({ id: target.id, epoch, holder, now, leaseMs }));
    return { claimed: true, epoch, item: foldWorkItems(readLines(file), now).get(target.id) };
  }, { label: `claim ${id ?? 'next'}` });
}

/** Extend a lease. Written by the server on a timer, never by a model. */
export function heartbeatWorkItem(projectDir, id, { epoch, holder, leaseMs = LEASE_MS, now = Date.now() } = {}) {
  appendLine(ledgerPath(projectDir), buildHeartbeatLine({ id, epoch, holder, now, leaseMs }));
}

/** Hand an item back without finishing it. */
export function releaseWorkItem(projectDir, id, { epoch, now = Date.now() } = {}) {
  appendLine(ledgerPath(projectDir), buildReleaseLine({ id, epoch, now }));
  return readWorkItem(projectDir, id, now);
}

// Release only the uninterrupted claim acquired by this run. A tool server
// may outlive its turn, so process lifetime is not run lifetime. The first
// claim after the spawn snapshot identifies the holder; same-holder renewals
// are allowed, but a release or another holder ends this run's ownership.
export function releaseRunClaim(projectDir, id, { afterEpoch, startedAt, now = Date.now() } = {}) {
  if (!Number.isFinite(afterEpoch) || !Number.isFinite(startedAt)) return null;
  const lines = readLines(ledgerPath(projectDir)).map(normalizeLine).filter(line => line?.id === id);
  const item = foldWorkItems(lines, now).get(id);
  if (!item?.claim) return item;
  const claims = lines.filter(line => line.claim && !line.heartbeat && line.epoch > afterEpoch);
  const first = claims[0];
  if (!first || first.epoch !== afterEpoch + 1 || first.ts < startedAt) return item;
  if (claims.some(line => line.claim.holder !== first.claim.holder)) return item;
  if (lines.some(line => line.release && line.epoch >= first.epoch)) return item;
  if (item.claim.holder !== first.claim.holder) return item;
  // A concurrent new claim fences this append out through its newer epoch.
  return releaseWorkItem(projectDir, id, { epoch: item.epoch, now });
}

/* ------------------------------ the team sync ----------------------------- */
// A TEAMMATE'S LINES, PULLED FROM THE CLOUD, ENTER THE LEDGER HERE AND ONLY
// HERE, which keeps this file the one write path even with several writers on
// several Macs. Each line goes in verbatim, still its author's, and a line
// whose uid the ledger already holds is skipped, so pulling the same page twice
// stores it once. A line with no uid or no writer is refused: nothing could tell
// it apart on the next pull. So is one too big to write, which used to throw
// and leave the pull cursor in front of it forever (review, 2026-10-01): a bad
// line is skipped and the pull moves past it. Returns how many were appended.
export function appendForeignLines(projectDir, lines) {
  const file = ledgerPath(projectDir);
  const have = new Set();
  for (const text of readLines(file)) {
    const uid = /"uid":"([^"]+)"/.exec(text)?.[1];
    if (uid) have.add(uid);
  }
  let added = 0;
  for (const raw of Array.isArray(lines) ? lines : []) {
    const line = normalizeLine(raw);
    if (!line || !line.uid || !line.by || have.has(line.uid)) continue;
    if (Buffer.byteLength(JSON.stringify(raw) + '\n', 'utf8') > MAX_LINE_BYTES) continue;
    writeLine(file, raw);
    have.add(line.uid);
    added += 1;
  }
  return added;
}

// Every line after a byte offset, as written, and where the file ends. The
// ledger only grows, so an offset is a cursor: sync keeps the one it pushed to
// and asks from there next time.
export function readLinesFrom(projectDir, offset = 0) {
  const file = ledgerPath(projectDir);
  let size;
  try { size = fs.statSync(file).size; } catch (err) {
    if (err.code === 'ENOENT') return { lines: [], end: 0 };
    throw err;
  }
  const start = Math.max(0, Math.min(Number(offset) || 0, size));
  if (start >= size) return { lines: [], end: size };
  const fd = fs.openSync(file, 'r');
  let text;
  try {
    const buf = Buffer.allocUnsafe(size - start);
    const read = fs.readSync(fd, buf, 0, size - start, start);
    text = buf.toString('utf8', 0, read);
  } finally {
    fs.closeSync(fd);
  }
  // Stop at the last whole line: a line still being written is read next time.
  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline < 0) return { lines: [], end: start };
  const whole = text.slice(0, lastNewline + 1);
  const lines = [];
  for (const piece of whole.split('\n')) {
    if (!piece || Buffer.byteLength(piece, 'utf8') > MAX_LINE_BYTES) continue;
    try { lines.push(JSON.parse(piece)); } catch { /* a torn line reads as nothing, as in the fold */ }
  }
  return { lines, end: start + Buffer.byteLength(whole, 'utf8') };
}

export { LEASE_MS };
export const _internals = {
  appendLine,
  readLines,
  ledgerPath,
  forgetFolds: () => {
    folded.clear();
    histories.clear();
    wholeFolds.clear();
    for (const file of [...pinned.keys()]) dropPin(file);
  },
};

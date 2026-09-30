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
  foldWorkItems, normalizeLine, buildLine, buildClaimLine, buildHeartbeatLine, buildReleaseLine,
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
function appendLine(file, obj) {
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

function ledgerStamp(file) {
  try {
    const st = fs.statSync(file);
    return `${st.ino}:${st.size}:${st.mtimeMs}`;
  } catch (err) {
    if (err.code === 'ENOENT') return 'absent';
    throw err;
  }
}

function foldedLedger(file) {
  const stamp = ledgerStamp(file);
  const held = folded.get(file);
  if (held && held.stamp === stamp) return held.items;
  // Time zero, so the lease pass inside the fold expires nothing: a lease is
  // only ever lapsed against the clock of the call asking, and that is `aged`.
  const items = stamp === 'absent' ? new Map() : foldWorkItems(readLines(file), 0);
  // One entry per ledger, so a real store has a few dozen. The cap is for the
  // long-lived MCP server, which walks temporary project dirs that never come
  // back; a Map iterates in insertion order, so the oldest key goes first.
  if (folded.size >= MAX_FOLDS_HELD) folded.delete(folded.keys().next().value);
  folded.set(file, { stamp, items });
  return items;
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

/** One work item, or null. */
export function readWorkItem(projectDir, id, now = Date.now()) {
  if (!isWorkItemId(id)) return null;
  const item = foldedLedger(ledgerPath(projectDir)).get(id);
  return item ? aged(item, now) : null;
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

export { LEASE_MS };
export const _internals = { appendLine, readLines, ledgerPath, forgetFolds: () => folded.clear() };

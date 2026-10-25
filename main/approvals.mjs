// The app side of the approvals channel: read what workers are waiting on and
// write the founder's decision, as files in the spool dir the approval-prompt
// server polls, so a restart on either side loses nothing.
//
// A worker can write in this spool. The store root is in its
// `additionalDirectories` and Bash is allowed broadly; what an agent may do is
// the user's call (`worker-permissions.json`), so this file treats that as the
// threat model rather than narrowing it. In Node, writeFileSync and
// appendFileSync write through a symlink to its target, and readFileSync on a
// fifo blocks forever. So nothing here is opened through a link, nothing is
// opened that is not a regular file, and every write is created at an
// unguessable name and renamed onto the real one, which replaces a link
// without following it. These helpers are the one place that rule lives.
//
// Nothing in a request file is believed about time; card order is ours, see
// `listPending`. A worker can still put a card in front of her, because a file
// is the whole Claude Code protocol and provenance cannot be proved. It cannot
// aim her click at another file, append to one, or jump or hold the queue.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { cardDigest } from '../shared/approval-card.mjs';

export function spoolDir(storeRoot) {
  return path.join(storeRoot, '.approvals');
}

// An answer file a worker writes must not count as her approval. The Claude
// Code side waits in a separate process, the worker's own child, so a file is
// all it can read. A shared secret does not help: anything handed to that
// server passes through the worker's environment, which the worker can read.
// So Agentbox signs each decision with an ed25519 private key held only in its
// own process, and the server gets the public half, which verifies and cannot
// sign. The signature covers id, verdict, note, time and card together, so a
// decision cannot be moved, flipped or replayed.
//
// The pair is per run and never written to disk, because a key file in her
// home is one a worker can read, and restarting Agentbox kills every worker
// anyway. Not closed here: a same-uid worker can kill that server or patch its
// check. macOS keeps it from reading Agentbox's memory, so it cannot sign.

let pair = null;
const keys = () => (pair ??= crypto.generateKeyPairSync('ed25519'));

/** The half it is safe to hand a worker: it verifies and it cannot sign. */
export function approvalPublicKey() {
  return keys().publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

// A signature over an id alone says nothing about what she agreed to, because
// a worker can rewrite its request file in place while the waiting process
// still holds the original. So `answer` signs a digest of the card Agentbox
// last showed her, and each engine compares it with the request it holds
// (approval-prompt-server.mjs its `request`, codex-approvals.mjs its `open`
// entry). A mismatch is a deny.
//
// The digest is of what was displayed, not of the file at answer time: a
// re-read lets a worker flip the file between a harmless body and the real one.
// `listPending` is the only reader, and every caller acts on or draws exactly
// what it returned, so the digest taken there is the card she saw.
//
// The digest itself is shared/approval-card.mjs, so the cloud server takes the
// same one of a card it puts on the phone.
export { cardDigest };

// An array, not an object, because the verifier rebuilds these bytes from a
// parsed file and object key order would change them.
function decisionBytes(id, allow, note, at, card) {
  return Buffer.from(JSON.stringify([String(id), !!allow, note ?? null, at ?? null, card ?? null]), 'utf8');
}

/**
 * Whether Agentbox signed this answer for this request. False for anything a
 * worker writes, including a real answer whose `card` was edited.
 */
export function answerIsHers(id, answer, publicKey = approvalPublicKey()) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return false;
  if (typeof answer.sig !== 'string' || !answer.sig) return false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    return crypto.verify(null, decisionBytes(id, answer.allow, answer.note, answer.at, answer.card), key, Buffer.from(answer.sig, 'base64'));
  } catch {
    return false;
  }
}

/**
 * How long a request file may sit here with nobody waiting on it. A forgery and
 * a dead worker's leftover leave this way, and they are the only two things
 * that should: a card still being waited on is kept here by whoever is waiting,
 * which is a beat of main/codex-approvals.mjs `tend` and of
 * approval-prompt-core.mjs's own loop. Neither gives up on a clock any more
 * (w-4b00022acb), so this is no longer a deadline shadowing theirs.
 */
export const REQUEST_TTL_MS = 16 * 60_000;

/**
 * Caps what a worker can make Agentbox hold in memory on every poll. A larger
 * file is skipped like an unparseable one, and the TTL removes it.
 */
export const MAX_REQUEST_BYTES = 1024 * 1024;

const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0; // undefined on Windows, which this app is not
const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | O_NOFOLLOW;
const APPEND_FLAGS = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | O_NOFOLLOW;

// `lstat`, because `existsSync` follows a link and says no for a dangling one.
export function spoolEntryExists(dir, name) {
  try { fs.lstatSync(path.join(dir, name)); return true; } catch { return false; }
}

// `rm` unlinks a symlink rather than following it, so this never reaches
// outside the spool, and it removes a directory, which `unlink` refuses.
export function removeSpoolEntry(dir, name) {
  try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); } catch { /* already gone */ }
}

/**
 * One spool file as parsed JSON, or null. O_NOFOLLOW so a link to her file is
 * never opened, O_NONBLOCK so a fifo cannot freeze the main process, and
 * `fstat` on the open descriptor so the name cannot be swapped after a check.
 */
export function readSpoolJson(dir, name) {
  let fd = null;
  try {
    fd = fs.openSync(path.join(dir, name), READ_FLAGS);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_REQUEST_BYTES) return null;
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }
}

/**
 * Write a spool file without writing through whatever is already there. The
 * exclusive create is at an unguessable name, and the rename replaces a planted
 * link instead of following it. Plain `wx` on the final name would also refuse
 * a link, but would lose her click whenever something squatted the name. The
 * second attempt is for a directory, which `rename` cannot replace.
 */
export function writeSpoolFile(dir, name, text) {
  const dest = path.join(dir, name);
  const tmp = path.join(dir, `.${crypto.randomUUID()}.tmp`);
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, text);
    fs.closeSync(fd);
    fd = null;
  } catch {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    try { fs.unlinkSync(tmp); } catch { /* never got made */ }
    return false;
  }
  try { fs.renameSync(tmp, dest); return true; } catch { /* something unreplaceable is there */ }
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(tmp, dest);
    return true;
  } catch { /* the spool itself will not take a write; the caller denies */ }
  try { fs.unlinkSync(tmp); } catch { /* best effort */ }
  return false;
}

/**
 * Append one audit line, never into a file of hers. `log.jsonl` is a fixed
 * name and the line carries the worker's own command, so a link planted there
 * would put agent text into her files. O_NOFOLLOW refuses the link. Refusing
 * alone would end auditing silently, because callers ignore a failed log line,
 * so anything that is not a regular file is removed, with a warning, and a
 * real file opened in its place.
 */
export function appendSpoolLine(dir, name, line) {
  if (appendOnce(dir, name, line)) return true;
  let squatter = null;
  try { squatter = fs.lstatSync(path.join(dir, name)); } catch { return false; }
  if (squatter.isFile()) return false; // a real log we simply could not write to
  console.warn(`zero: ${name} in the approvals spool was ${squatter.isSymbolicLink() ? 'a link' : 'not a file'}, which only a worker can have done; it has been removed and the audit line written to a real one`);
  removeSpoolEntry(dir, name);
  return appendOnce(dir, name, line);
}

function appendOnce(dir, name, line) {
  let fd = null;
  try {
    fd = fs.openSync(path.join(dir, name), APPEND_FLAGS, 0o600);
    fs.writeFileSync(fd, line);
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* already closed */ } }
  }
}

/**
 * When this process first saw each request, the only clock in the spool a
 * worker cannot write. The request's own `at` is never used for order: a
 * forged `at: 0` would take the front card, which ⌘Y/⌘N and the Agents menu
 * act on. `seq` only increases; `at` here is what the TTL counts from. Keyed by
 * directory and id, and pruned to what is on disk on every pass.
 */
const seenAt = new Map();
let sightings = 0;

const REQUEST_SUFFIX = '.request.json';

/**
 * Orders requests first seen in the same poll. Not by `readdir`, which returns
 * name order on macOS, and a forgery picks its own name. `ctime` is the one
 * timestamp a worker cannot move backwards: `utimes` can set mtime and
 * birthtime to 0 but pushes ctime to now. Nanoseconds because APFS keeps them.
 * On a coarse clock (tmpfs) two files share a ctime, so the kernel-assigned
 * inode breaks the tie.
 */
function bornAt(dir, name) {
  try {
    const st = fs.lstatSync(path.join(dir, name), { bigint: true });
    return { ctime: st.ctimeNs, ino: st.ino };
  } catch { return { ctime: 2n ** 63n, ino: 2n ** 63n }; } // gone or unreadable: never in front of something real
}

export function listPending(storeRoot, { now = Date.now } = {}) {
  const dir = spoolDir(storeRoot);
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return []; }
  const at = now();
  // NUL cannot occur in a path, so two spools never collide.
  const prefix = `${dir}\0`;
  const names = files.filter((f) => f.endsWith(REQUEST_SUFFIX));
  // Queue everything new in this pass before reading any of it, oldest first.
  for (const { f } of names
    .filter((f) => !seenAt.has(prefix + f.slice(0, -REQUEST_SUFFIX.length)))
    .map((f) => ({ f, born: bornAt(dir, f) }))
    .sort((a, b) => (a.born.ctime < b.born.ctime ? -1 : a.born.ctime > b.born.ctime ? 1
      : a.born.ino < b.born.ino ? -1 : a.born.ino > b.born.ino ? 1 : 0))) {
    seenAt.set(prefix + f.slice(0, -REQUEST_SUFFIX.length), { at, seq: sightings += 1 });
  }
  const present = new Set();
  const pending = [];
  for (const f of names) {
    const id = f.slice(0, -REQUEST_SUFFIX.length);
    const key = prefix + id;
    const seen = seenAt.get(key);
    if (at - seen.at > REQUEST_TTL_MS) {
      console.warn(`zero: approval ${id} sat in the spool with nothing waiting on it for ${Math.round(REQUEST_TTL_MS / 60_000)} minutes; it has been taken out`);
      removeSpoolEntry(dir, f);
      removeSpoolEntry(dir, `${id}.answer.json`);
      continue;
    }
    present.add(key);
    // A decided card is hidden while its engine reaps it, but only if the
    // answer is hers. Otherwise any answer file could hide any card until it
    // timed out. An answer she did not sign is removed.
    const answerName = `${id}.answer.json`;
    if (files.includes(answerName)) {
      if (answerIsHers(id, readSpoolJson(dir, answerName))) continue;
      console.warn(`zero: an answer file appeared for approval ${id} that the founder did not write; it has been deleted and the card is still waiting`);
      removeSpoolEntry(dir, answerName);
    }
    const request = readSpoolJson(dir, f);
    // `answer` signs this digest, so her press authorises the card she saw.
    // Kept from the last successful read, because an unreadable file also
    // leaves her screen, so the old digest is still the last card she saw.
    if (request) {
      seen.card = cardDigest(request);
      pending.push({ request, seq: seen.seq });
    }
  }
  for (const key of seenAt.keys()) if (key.startsWith(prefix) && !present.has(key)) seenAt.delete(key);
  return pending.sort((a, b) => a.seq - b.seq).map((p) => p.request);
}

/** The digest of the card last shown for this request, or null if none was. */
export function cardShown(storeRoot, id) {
  return seenAt.get(`${spoolDir(storeRoot)}\0${id}`)?.card ?? null;
}

/** Whether `card` is the card last drawn for this request: a phone answers with the one it drew. */
export function cardStillShown(storeRoot, id, card) {
  return typeof card === 'string' && !!card && cardShown(storeRoot, id) === card;
}

export function answer(storeRoot, id, allow, note) {
  if (!/^[\w-]+$/.test(String(id ?? ''))) return false;
  const dir = spoolDir(storeRoot);
  if (!spoolEntryExists(dir, `${id}.request.json`)) return false;
  // Every route that answers calls `listPending` first, so a card is always
  // here. Reading the file instead would sign something she may not have seen.
  const card = cardShown(storeRoot, id);
  if (!card) return false;
  const at = Date.now();
  const sig = crypto.sign(null, decisionBytes(id, !!allow, note ?? null, at, card), keys().privateKey).toString('base64');
  return writeSpoolFile(dir, `${id}.answer.json`,
    JSON.stringify({ allow: !!allow, note: note ?? null, at, card, sig }));
}

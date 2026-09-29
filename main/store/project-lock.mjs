// A cross-process advisory lock, one per project.
//
// Why this exists: main/store/write-queue.mjs serializes catalog writes inside
// ONE process, which was the whole world when the only writer was the app's
// main process. It is not the world any more. Stateless wake-ups mean a dozen
// MCP server children can be live at once, each against the same store, and
// an in-process promise chain says nothing about any of them. readIndex ->
// mutate -> atomicWriteJson across two processes is a lost update: both read
// revision N, both write, one document silently vanishes from the catalog.
// atomicWriteJson is atomic per write (tmp + rename); it is not a
// compare-and-swap, and nothing in the store ever pretended otherwise.
//
// The mechanism is the oldest one there is: create a file with O_EXCL, which
// the kernel guarantees will succeed for exactly one caller.
//
// THE HARD PART IS NOT TAKING THE LOCK, IT IS BREAKING A STALE ONE. A holder
// can die without releasing (crash, SIGKILL, a laptop lid), so a lock nobody
// holds must eventually be breakable or the store wedges silently, which is the
// expensive failure. But the obvious test, "is the holder's pid alive", is a
// HINT AND NOT PROOF: pids get recycled, so an unrelated process inheriting a
// dead holder's number would keep a lock alive forever, and the wedge is
// permanent and invisible. So:
//
//   - a random token, not the pid, is what identifies a holder
//   - a conservative timeout is the real arbiter of staleness
//   - the pid check is used only in the direction it is sound: a pid that is
//     GONE proves the holder is gone (that lock can be broken early). A pid
//     that is alive proves nothing and buys no extra time.
//   - critical sections stay tiny (read, mutate, rename, release) so the window
//     in which a wrongly-broken lock could matter is measured in milliseconds

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// How long a lock may be held before another process may break it. Far longer
// than any legitimate critical section here (all of which are a read, a JSON
// mutate, and a rename) and far shorter than a founder would tolerate a wedge.
export const STALE_MS = 30_000;
// Total time to wait for a contended lock before giving up. A dozen writers
// queueing on sub-millisecond sections never comes close to this.
const ACQUIRE_TIMEOUT_MS = 15_000;
// Backoff between attempts: fast at first (the common case is microseconds of
// contention), then easing off so a genuinely stuck lock is not spun on.
const BACKOFF_MS = [1, 2, 5, 10, 20, 50, 100, 200];

const lockPath = (projectDir) => path.join(projectDir, '.lock');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Is this pid gone? Signal 0 checks existence without delivering anything.
// Only the FALSE answer here is trustworthy (see the header): a live pid may be
// a recycled number, but a missing one is definitely not our holder.
function pidGone(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return false; } catch (err) { return err.code === 'ESRCH'; }
}

function readHolder(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Try once. Returns the token on success, null if someone else holds it.
function tryAcquire(file, label) {
  const token = crypto.randomBytes(12).toString('hex');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(file, 'wx'); // O_CREAT | O_EXCL: exactly one winner
    try {
      fs.writeSync(fd, JSON.stringify({ token, pid: process.pid, at: Date.now(), label }));
    } finally {
      fs.closeSync(fd);
    }
    return token;
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    return null;
  }
}

// Break a lock that is provably or presumptively abandoned. The token check is
// what makes this safe against the race with a legitimate holder releasing at
// the same moment: we only unlink the exact holder we decided was stale, so a
// fresh lock taken in between survives.
function breakIfStale(file, now = Date.now()) {
  const held = readHolder(file);
  if (!held) {
    // Unreadable or truncated: a torn write from a holder that died mid-create.
    // Age it out rather than trusting a file we cannot parse.
    try {
      const age = now - fs.statSync(file).mtimeMs;
      if (age > STALE_MS) fs.unlinkSync(file);
    } catch { /* already gone; someone else won the break */ }
    return;
  }
  const expired = !Number.isFinite(held.at) || (now - held.at) > STALE_MS;
  const dead = pidGone(held.pid);
  if (!expired && !dead) return;

  // Re-read immediately before unlinking and confirm it is still the same
  // holder. Without this, breaking a stale lock could delete a brand new one
  // taken microseconds earlier by a healthy process.
  const still = readHolder(file);
  if (still?.token !== held.token) return;
  try { fs.unlinkSync(file); } catch { /* someone else broke it first */ }
}

function release(file, token) {
  const held = readHolder(file);
  // Only ever release OUR lock. If the token differs, ours was already broken
  // as stale and someone else legitimately holds it now; unlinking would evict
  // an innocent holder.
  if (held && held.token !== token) return false;
  try { fs.unlinkSync(file); return true; } catch { return false; }
}

/**
 * Run `fn` holding the project's lock. Cross-process safe.
 *
 * Keep the body SHORT: a read, a mutate, a rename. Never await network, never
 * spawn, never call another locked helper (the lock is not reentrant, and a
 * nested acquire would deadlock against itself until the stale timeout).
 */
export async function withProjectLock(projectDir, fn, { label = '', timeoutMs = ACQUIRE_TIMEOUT_MS } = {}) {
  const file = lockPath(projectDir);
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  for (;;) {
    const token = tryAcquire(file, label);
    if (token) {
      try {
        return await fn();
      } finally {
        release(file, token);
      }
    }

    breakIfStale(file);
    if (Date.now() >= deadline) {
      const held = readHolder(file);
      throw new Error(
        `could not lock ${projectDir} within ${timeoutMs}ms` +
        (held ? ` (held by pid ${held.pid}${held.label ? ` for ${held.label}` : ''} since ${new Date(held.at).toISOString()})` : ''),
      );
    }
    await sleep(BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
  }
}

// A real blocking sleep, for the synchronous variant below. Atomics.wait on a
// buffer nobody will ever notify parks the thread for the duration instead of
// spinning the CPU, which a busy loop would do.
const PARK = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms) {
  Atomics.wait(PARK, 0, 0, ms);
}

/**
 * The synchronous twin, for callers that cannot become async.
 *
 * This exists for exactly one reason: index.json's read-modify-write lives in
 * updateIndex, which is synchronous and is called from roughly thirty places
 * across the app. Making it async would ripple through all of them for no
 * benefit, and a half-migrated version of that ripple is a worse risk than a
 * blocking wait measured in milliseconds.
 *
 * It blocks the event loop while waiting, so the same rule as the async version
 * applies with more force: KEEP THE BODY SHORT. Read, mutate, rename. Never do
 * IO that can hang here.
 */
export function withProjectLockSync(projectDir, fn, { label = '', timeoutMs = ACQUIRE_TIMEOUT_MS } = {}) {
  const file = lockPath(projectDir);
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  for (;;) {
    const token = tryAcquire(file, label);
    if (token) {
      try {
        return fn();
      } finally {
        release(file, token);
      }
    }

    breakIfStale(file);
    if (Date.now() >= deadline) {
      const held = readHolder(file);
      throw new Error(
        `could not lock ${projectDir} within ${timeoutMs}ms` +
        (held ? ` (held by pid ${held.pid}${held.label ? ` for ${held.label}` : ''} since ${new Date(held.at).toISOString()})` : ''),
      );
    }
    sleepSync(BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
  }
}

// Exported for tests and for a diagnostic surface; not part of normal use.
export const _internals = { lockPath, readHolder, breakIfStale, tryAcquire, release, pidGone };

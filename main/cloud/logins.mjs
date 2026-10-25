// THE CLOUD'S ACCOUNTS, AS THE MAC KNOWS THEM: BY NAME, NEVER BY CONTENT.
//
// A cloud account is one a person ADDED for the cloud, signed in through the
// vendor's own page, and it need not be any account this Mac uses (2026-10-14:
// "we shouldn't predefine which accounts to sign up with ... maybe I want to
// sign in with my work account"). Each is filed under a key of its own
// (`acct-…`), and a cloud run of an engine takes whichever of that engine's
// accounts was used least recently (`pickCloudLogin`).
//
// docs/cloud/PLAN.md, "Sign-ins live in the cloud". A person signs in to
// Claude or Codex inside a cloud sandbox, through the vendor's own sign-in,
// and the login is kept in the cloud bucket as `logins/<engine>/<id>.json`.
// The Mac keeps only a note per account in ~/.agentbox/cloud-logins.json:
// which object is current, when it was saved, when a Codex one runs out, and
// whether it stopped working. Nothing here ever reads a login object; it only
// asks for links to one, which the sandbox uses.
//
// Three things the Mac does with that note:
//   - decides whether an account's threads may go to the cloud
//     (`cloudLoginState`);
//   - runs the sign-in from the cloud menu (`startCloudSignIn`), which is a
//     sandbox session the Mac only relays a link and a code to;
//   - renews a Codex login before it runs out (`renewCloudCodexLogin`), one
//     at a time per account, fenced across an app restart.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { wayBack, listenForWayBack } from './browser-return.mjs';

// A Codex access token lasts 240 hours. One with under 3 days left is
// renewed; one with under 9 hours (an 8-hour run and its homecoming) does not
// start a run until it has been.
export const CODEX_RENEW_BEFORE_MS = 3 * 24 * 3600_000;
export const CODEX_RUN_NEEDS_MS = 9 * 3600_000;
// A renewal that started this long ago and never said how it ended is over.
const RENEWAL_FENCE_MS = 10 * 60_000;
// An object a newer sign-in replaced is deleted this long after, so a run
// that was handed its link a moment before still finds it.
const OLD_LOGIN_GRACE_MS = 60 * 60_000;
const LINK_SECONDS = 30 * 60;

export const loginObjectKey = (engine, id) => `logins/${engine}/${id}.json`;
export const cloudLoginsPath = (home = os.homedir()) => path.join(home, '.agentbox', 'cloud-logins.json');
// The key is the account's own (`acct-…`), or, in older notes and tests, a
// folder; either way it is used exactly as given.
const accountOf = (engine, key) => `${engine}:${key}`;
export const newCloudAccountKey = () => `acct-${crypto.randomUUID().slice(0, 8)}`;

export function readCloudLogins({ home = os.homedir() } = {}) {
  try {
    const all = JSON.parse(fs.readFileSync(cloudLoginsPath(home), 'utf8'));
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

function writeCloudLogins(all, { home = os.homedir() } = {}) {
  const file = cloudLoginsPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// ONE WRITER AT A TIME. The supervisor and every cloud run's own process
// write this note; a check of the current login and the write after it must
// be one step, or an old run's report lands over a new sign-in (Codex's
// review, finding 2). A lock file, taken exclusively; one left by a process
// that died is stale after ten seconds.
function withLock(home, fn) {
  const lock = `${cloudLoginsPath(home)}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const until = Date.now() + 5000;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) { fs.rmSync(lock, { force: true }); continue; } } catch { continue; }
      if (Date.now() > until) throw new Error('the cloud sign-in note is busy');
      Atomics.wait(pause, 0, 0, 15);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { force: true }); }
}

export function cloudLoginFor(engine, dir, { home = os.homedir() } = {}) {
  return readCloudLogins({ home })[accountOf(engine, dir)] ?? null;
}

// A new sign-in becomes the account's current one. What it replaced is kept
// on a list to delete once no run can still be about to fetch it.
export function recordCloudLogin(engine, dir, { id, savedAt = Date.now(), expiresAt = null, email = null, org = null, limits = null }, { home = os.homedir(), now = Date.now() } = {}) {
  return withLock(home, () => {
  const all = readCloudLogins({ home });
  const key = accountOf(engine, dir);
  const was = all[key];
  const retired = [...(was?.retired || [])];
  if (was?.id && was.id !== id) retired.push({ id: was.id, at: now });
  // What the cloud read off a reply at sign-in: whose organization, and the usage.
  const read = org || limits?.length ? { org: org ?? null, limits: limits ?? [], readAt: now } : {};
  all[key] = { engine, key: dir, id, savedAt, expiresAt, email: email ?? was?.email ?? null, broken: null, renewing: null, lastUsedAt: was?.lastUsedAt ?? null, retired, ...read };
  writeCloudLogins(all, { home });
  return all[key];
  });
}

// A change to the account's note that applies only while `id` is still its
// current login: an old run that reports trouble cannot undo a new sign-in.
export function markCloudLogin(engine, dir, id, patch, { home = os.homedir() } = {}) {
  return withLock(home, () => {
    const all = readCloudLogins({ home });
    const key = accountOf(engine, dir);
    if (!all[key] || (id != null && all[key].id !== id)) return false;
    all[key] = { ...all[key], ...patch };
    writeCloudLogins(all, { home });
    return true;
  });
}

// THE SAME ACCOUNT ADDED TWICE: records of one engine whose organization
// (`org`, main/cloud/org.mjs) matches an earlier record's, by when they were
// saved. Key -> the earlier record's key. A record with no org yet is no one's
// duplicate.
function duplicatesIn(records) {
  const first = new Map();
  const dup = new Map();
  for (const r of [...records].sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0) || String(a.key).localeCompare(String(b.key)))) {
    if (!r?.org) continue;
    const id = `${r.engine}:${r.org}`;
    if (first.has(id)) dup.set(r.key ?? r.dir, first.get(id));
    else first.set(id, r.key ?? r.dir);
  }
  return dup;
}

// 'none' (never signed in), 'broken' (sign in again), 'duplicate' (the same
// account as an earlier one), 'limited' (at its usage limit until
// `limitedUntil`), 'renew' (Codex: must be renewed before a run), 'stale'
// (Codex: may run, renewal due), 'ready'.
export function cloudLoginState(rec, { now = Date.now() } = {}) {
  if (!rec?.id) return 'none';
  if (rec.broken) return 'broken';
  if (rec.duplicateOf) return 'duplicate';
  if (rec.limitedUntil && now < rec.limitedUntil) return 'limited';
  if (rec.engine !== 'codex' || !rec.expiresAt) return 'ready';
  const left = rec.expiresAt - now;
  if (left < CODEX_RUN_NEEDS_MS) return 'renew';
  if (left < CODEX_RENEW_BEFORE_MS) return 'stale';
  return 'ready';
}

export const mayRunOn = (state) => state === 'ready' || state === 'stale';

// Every cloud account of an engine, oldest first.
export function listCloudLogins(engine, { home = os.homedir() } = {}) {
  const mine = Object.values(readCloudLogins({ home })).filter((r) => r && r.engine === engine && r.id);
  const dup = duplicatesIn(mine);
  return mine
    .map((r) => ({ ...r, key: r.key ?? r.dir, ...(dup.has(r.key ?? r.dir) ? { duplicateOf: dup.get(r.key ?? r.dir) } : {}) }))
    .sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
}

export function cloudAccountsFrom(env = process.env) {
  const list = String(env.AGENTBOX_CLOUD_ACCOUNTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : null;
}

// The cloud account that is this Mac's own account, which the app hands each
// cloud run it starts (Supervisor#_cloudAccountEnv).
export const CLOUD_ACCOUNT_ENV = { claude: 'AGENTBOX_CLOUD_CLAUDE_ACCOUNT', codex: 'AGENTBOX_CLOUD_CODEX_ACCOUNT' };
export function cloudAccountFrom(env = process.env, engine = 'claude') {
  return String(env?.[CLOUD_ACCOUNT_ENV[engine]] ?? '').trim() || null;
}

// THE ACCOUNT A CLOUD RUN USES, AND IT IS ONE ACCOUNT (w-dac993a554).
//
// It used to be whichever of this engine's accounts was used least recently,
// so runs spread over every account added and a limit on one simply moved the
// work to the next. That is one person's work shared over several
// subscriptions to get past their limits, which is what the Mac stopped doing
// in `Supervisor#_theOneAccount` and what the cloud stops doing here.
//
// The account is the one this Mac runs on (`prefer`), when it is signed in to
// the cloud, so picking an account in Settings moves the cloud too; otherwise
// the first one signed in. A usage limit is never a reason to reach for
// another: `mayRunOn` turns a limited account down, and the cloud runs nothing
// and the menu says until when (renderer/src/cloud-menu.ts).
//
// `only` (emails or keys) narrows it for a copy of the app under test, which
// shares this list with the person's own app.
function accountInUse(all, engine, { now, only, prefer }) {
  const dup = duplicatesIn(Object.values(all).filter((r) => r?.engine === engine));
  const named = (r) => !only || [r.email, r.key ?? r.dir].some((n) => n && only.includes(String(n).toLowerCase()));
  // A login that was never finished or has stopped working is not an account
  // at all. A Codex login due a renewal is the account and simply cannot run
  // yet; `Supervisor#_renewCloudLogins` mends that on its own clock.
  const accounts = Object.entries(all)
    .filter(([, r]) => r?.engine === engine && !dup.has(r.key ?? r.dir) && named(r))
    .filter(([, r]) => !['none', 'broken'].includes(cloudLoginState(r, { now })))
    .sort(([, a], [, b]) => (a.savedAt || 0) - (b.savedAt || 0));
  return (prefer && accounts.find(([, r]) => (r.key ?? r.dir) === prefer)) || accounts[0] || null;
}

/** The account a run would take now, whether or not it can run. Null with none. */
export function cloudLoginInUse(engine, { home = os.homedir(), now = Date.now(), only = null, prefer = null } = {}) {
  const hit = accountInUse(readCloudLogins({ home }), engine, { now, only, prefer });
  return hit ? { ...hit[1], key: hit[1].key ?? hit[1].dir } : null;
}

export function pickCloudLogin(engine, { home = os.homedir(), now = Date.now(), only = null, prefer = null } = {}) {
  return withLock(home, () => {
    const all = readCloudLogins({ home });
    const hit = accountInUse(all, engine, { now, only, prefer });
    if (!hit || !mayRunOn(cloudLoginState(hit[1], { now }))) return null;
    const [k, r] = hit;
    all[k] = { ...r, lastUsedAt: now };
    writeCloudLogins(all, { home });
    return { ...all[k], key: r.key ?? r.dir };
  });
}

const clock = (t) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();

/** Why a run found no account to take, as its thread will quote it. */
export function noCloudAccountSentence(engine, inUse, { now = Date.now() } = {}) {
  const name = engine === 'codex' ? 'Codex' : 'Claude';
  const state = inUse ? cloudLoginState(inUse, { now }) : 'none';
  if (state === 'limited') return `the ${name} account the cloud runs on is at its usage limit until ${clock(inUse.limitedUntil)}`;
  if (state === 'renew') return `the ${name} account the cloud runs on is renewing its sign-in`;
  return `no ${name} account is signed in for the cloud yet (the cloud button)`;
}

// An account she took out of the cloud. Its object goes too, and every older
// one it replaced (main/cloud/logins.mjs keeps them only for runs under way).
export async function removeCloudLogin(engine, key, { storage, home = os.homedir() } = {}) {
  const rec = cloudLoginFor(engine, key, { home });
  if (!rec) return false;
  withLock(home, () => {
    const all = readCloudLogins({ home });
    delete all[accountOf(engine, key)];
    writeCloudLogins(all, { home });
  });
  for (const id of [rec.id, ...(rec.retired || []).map((r) => r.id)]) {
    await Promise.resolve(storage?.del?.(loginObjectKey(engine, id))).catch(() => {});
  }
  return true;
}

// Delete what newer sign-ins replaced, once their grace is over. Never the
// current one.
export async function sweepRetiredLogins(engine, dir, { storage, home = os.homedir(), now = Date.now() } = {}) {
  const rec = cloudLoginFor(engine, dir, { home });
  if (!rec?.retired?.length || !storage?.del) return;
  const keep = [];
  for (const r of rec.retired) {
    if (now - r.at < OLD_LOGIN_GRACE_MS || r.id === rec.id) { keep.push(r); continue; }
    try { await storage.del(loginObjectKey(engine, r.id)); } catch { keep.push(r); }
  }
  markCloudLogin(engine, dir, rec.id, { retired: keep }, { home });
}

/* ------------------------------ a session -------------------------------- */
// One sandbox session that is not a run: a sign-in or a renewal. Starts it,
// reads its `signin` events until it says how it ended, and lets the session
// go. `onEvent` hears each event; the session's end is the promise's value.
async function session({ transport, start, onEvent = () => {}, pollWaitMs = 20_000, isCancelled = () => false }) {
  const sessionId = `agentbox-${start.action}-${start.engine}-${start.runId}`;
  const say = (state, extra = {}) => ({ state, ...extra });
  const invoke = async (payload) => {
    for (let failures = 0; ;) {
      try { return await transport.invoke(sessionId, payload); } catch (err) {
        failures += 1;
        if (failures > 5 || isCancelled()) throw err;
        await new Promise((r) => setTimeout(r, 500 * failures));
      }
    }
  };
  try {
    if (isCancelled()) return say('failed', { message: null });
    const started = await invoke(start);
    if (!started?.ok) return say('failed', { message: 'The cloud could not start the sign-in. Try again.' });
    // A cancel that raced the start: the session that did start is stopped.
    if (isCancelled()) {
      await transport.invoke(sessionId, { action: 'signal', runId: start.runId, signal: 'SIGTERM' }).catch(() => {});
      return say('failed', { message: null });
    }
    let since = 0;
    for (;;) {
      const page = await invoke({ action: 'events', runId: start.runId, since, waitMs: pollWaitMs });
      if (!page?.ok) return say('failed', { message: 'The cloud sign-in went away. Try again.' });
      for (const e of page.events || []) {
        since = Math.max(since, e.seq);
        if (e.kind !== 'signin') continue;
        onEvent(e);
        if (e.state === 'saved' || e.state === 'failed') return e;
      }
    }
  } catch {
    return say('failed', { message: 'The cloud could not be reached. Try again.' });
  } finally {
    await Promise.resolve(transport.stop?.(sessionId)).catch(() => {});
  }
}

/* ------------------------------ signing in ------------------------------- */
// THE CLOUD MENU'S SIGN-IN for one account. What the menu draws comes from
// `status()`: 'starting', then for Claude 'needs-code' with the link to open
// (the person pastes Claude's code into `code()`), for Codex 'waiting' with
// the link (the browser comes back to this computer, browser-return.mjs), or,
// from a cloud image older than that, the link and a one-time code to type on
// OpenAI's page; then 'checking', and 'saved' or 'failed' with a sentence. A
// Codex sign-in made with a different ChatGPT account than the one this Mac's
// folder holds is refused.
// HOW LONG THE CLOUD MAY CHECK A SIGN-IN AFTER HER PART IS DONE before this
// Mac stops waiting and says so (2026-10-15: she sat on "Adding…" for over a
// minute). The cloud gives up on a code Claude does not take at once, and on
// one it never answers in a minute (cloud/sandbox/server.mjs); this is the
// backstop for a cloud that never says, past its own two-minute check.
export const CHECK_MS = 150_000;
// The cloud hands the browser's return to Codex and follows its redirect,
// each with its own deadline (90 and 30 seconds); past both, it is not coming.
const RETURN_MS = 125_000;

function within(ms, promise) {
  let timer;
  const late = new Promise((_, no) => { timer = setTimeout(() => no(new Error('no answer')), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export function startCloudSignIn({ transport, storage, engine, dir, home = os.homedir(), expectEmail = null, onChange = () => {}, onSaved = () => {}, pollWaitMs, checkMs = CHECK_MS }) {
  const id = crypto.randomUUID();
  const runId = `signin-${id}`;
  const sessionId = `agentbox-signin-${engine}-${runId}`;
  // `attempt` tells one sign-in from the next, which can show the same link.
  let status = { state: 'starting', url: null, code: null, message: null, attempt: runId };
  let cancelled = false;
  let gaveUp = false;
  let checkTimer = null;
  let back = null;
  const letBackGo = () => { back?.close(); back = null; };
  const giveUp = (message) => {
    if (gaveUp || status.state === 'saved' || status.state === 'failed') return;
    gaveUp = true;
    cancelled = true;
    letBackGo();
    status = { ...status, state: 'failed', message };
    onChange(status);
    transport.invoke(sessionId, { action: 'signal', runId, signal: 'SIGTERM' }).catch(() => {});
  };
  const set = (patch) => {
    status = { ...status, ...patch };
    // The check's clock starts when her part ends, and stops when it ends.
    if (status.state === 'checking' && !checkTimer) {
      checkTimer = setTimeout(() => {
        if (status.state === 'checking') giveUp(`${engine === 'codex' ? 'Codex' : 'Claude'} didn’t finish signing in. Try again.`);
      }, checkMs);
      checkTimer.unref?.();
    } else if (status.state !== 'checking' && checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }
    onChange(status);
  };

  // The browser's return, passed to the cloud. Once taken the port goes, so
  // another Codex account can be added while this one is checked; one not
  // taken, short of OpenAI refusing it, leaves the sign-in waiting.
  const handOn = async (query) => {
    if (status.state !== 'waiting') return false;
    set({ state: 'checking', message: null });
    let out = null;
    try { out = await within(RETURN_MS, transport.invoke(sessionId, { action: 'signin-callback', runId, query })); } catch { /* not delivered */ }
    if (out?.ok) letBackGo();
    else if (out?.error !== 'refused' && status.state === 'checking') set({ state: 'waiting' });
    return !!out?.ok;
  };
  // The way back is open before the page is shown, so it is there first.
  const openWayBack = async (url) => {
    const at = wayBack(url);
    if (!at) return giveUp('Codex’s sign-in link had no way back. Try again.');
    try {
      back = await listenForWayBack({ ...at, onReturn: handOn });
    } catch {
      return giveUp('Another Codex sign-in is open on this computer. Close it, then try again.');
    }
    if (cancelled || status.state !== 'starting') return letBackGo();
    set({ state: 'waiting', url, code: null });
  };

  const done = (async () => {
    const saveUrl = await storage.putUrl(loginObjectKey(engine, id), LINK_SECONDS);
    const end = await session({
      transport,
      pollWaitMs,
      isCancelled: () => cancelled,
      start: { action: 'signin', runId, engine, saveUrl, ...(engine === 'codex' ? { flow: 'browser' } : {}) },
      onEvent: (e) => {
        if (e.state === 'needs-code') set({ state: 'needs-code', url: e.url });
        else if (e.state === 'waiting' && engine === 'codex' && !e.code) void openWayBack(e.url);
        else if (e.state === 'waiting') set({ state: 'waiting', url: e.url, code: e.code });
        else if (e.state === 'checking') set({ state: 'checking' });
      },
    }).finally(letBackGo);
    // Given up on here already: that sentence stands.
    if (gaveUp) return status;
    if (end.state !== 'saved') {
      set({ state: 'failed', message: cancelled ? null : (end.message || 'That did not work. Try again.') });
      return status;
    }
    if (engine === 'codex' && expectEmail && end.email && end.email.toLowerCase() !== String(expectEmail).toLowerCase()) {
      await Promise.resolve(storage.del?.(loginObjectKey(engine, id))).catch(() => {});
      set({ state: 'failed', message: `That signed in as ${end.email}. Sign in with ${expectEmail} instead.` });
      return status;
    }
    recordCloudLogin(engine, dir, { id, expiresAt: end.expiresAt ?? null, email: end.email ?? null, org: end.org ?? null, limits: end.limits ?? null }, { home });
    set({ state: 'saved', url: null, code: null });
    try { onSaved(); } catch { /* the menu redraws anyway */ }
    return status;
  })().catch((err) => {
    letBackGo();
    set({ state: 'failed', message: `That did not work (${err.message}). Try again.` });
    return status;
  });

  return {
    status: () => status,
    done,
    async code(text) {
      const c = String(text || '').trim();
      if (!c || status.state !== 'needs-code') return false;
      set({ state: 'checking', message: null });
      let ok = false;
      try {
        const out = await transport.invoke(sessionId, { action: 'signin-code', runId, code: c });
        ok = !!out?.ok;
      } catch { /* not delivered */ }
      // A code that did not reach the sign-in can be pasted again (finding 7).
      if (!ok && status.state === 'checking') set({ state: 'needs-code', message: 'That code did not reach the sign-in. Paste it again.' });
      return ok;
    },
    async cancel() {
      cancelled = true;
      letBackGo();
      try { await transport.invoke(sessionId, { action: 'signal', runId, signal: 'SIGTERM' }); } catch { /* gone */ }
    },
  };
}

/* ------------------------------- renewing -------------------------------- */
// ONE CODEX LOGIN RENEWED: a sandbox session that renews it from the real
// login and keeps the renewed one as a new object. Fenced by a `renewing`
// mark, so an app restarted mid-renewal does not start a second one on the
// same refresh token. Returns 'renewed', 'busy', 'signed-out' or 'failed'.
export async function renewCloudCodexLogin({ transport, storage, dir, home = os.homedir(), now = Date.now(), pollWaitMs }) {
  const rec = cloudLoginFor('codex', dir, { home });
  if (!rec?.id || rec.broken) return 'failed';
  const was = typeof rec.renewing === 'number' ? { at: rec.renewing, id: null } : rec.renewing;
  if (was && now - was.at < RENEWAL_FENCE_MS) return 'busy';
  // A RENEWAL THE APP NEVER HEARD THE END OF (it quit, or the Mac slept):
  // the renewed login may be in the cloud already, under the id written down
  // before it started. If it is, it is the current one, and the old refresh
  // token, which renewing spent, is never used again (finding 3).
  if (was?.id && await Promise.resolve(storage.exists?.(loginObjectKey('codex', was.id))).catch(() => false)) {
    recordCloudLogin('codex', dir, { id: was.id, expiresAt: was.at + 239 * 3600_000, email: rec.email }, { home, now });
    return 'renewed';
  }
  const id = crypto.randomUUID();
  markCloudLogin('codex', dir, rec.id, { renewing: { at: now, id } }, { home });
  const end = await session({
    transport,
    pollWaitMs,
    start: {
      action: 'renew',
      runId: `renew-${id}`,
      engine: 'codex',
      loginUrl: await storage.getUrl(loginObjectKey('codex', rec.id), LINK_SECONDS),
      saveUrl: await storage.putUrl(loginObjectKey('codex', id), LINK_SECONDS),
    },
  });
  if (end.state === 'saved') {
    recordCloudLogin('codex', dir, { id, expiresAt: end.expiresAt ?? null, email: rec.email }, { home, now: Date.now() });
    return 'renewed';
  }
  if (end.signedOut) {
    markCloudLogin('codex', dir, rec.id, { broken: 'signed-out', renewing: null }, { home });
    return 'signed-out';
  }
  markCloudLogin('codex', dir, rec.id, { renewing: null }, { home });
  return 'failed';
}

/* ------------------------------- looking --------------------------------- */
// A look's session and week, in the shape the usage meters draw. Null with none.
export function cloudLimits(read) {
  if (!Array.isArray(read) || !read.length) return null;
  return read.filter((l) => Number.isFinite(l?.percent)).map((l) => ({
    span: l.span === 'week' ? 'week' : 'session',
    qualifier: l.span === 'week' ? 'all models' : null,
    name: l.span === 'week' ? 'This week' : 'This session',
    // A session over its allowance reports utilization past 1.0.
    percent: Math.min(100, l.percent), resetsText: null, resetsOn: null, resetsAt: l.resetsAt ?? null, zone: null,
  }));
}

// WHOSE ONE CLAUDE LOGIN IS, AND HOW MUCH OF IT IS LEFT: a sandbox session
// that makes one tiny reply on it and reads the reply's headers. Kept on the
// login's note only while that login is still the current one. A failed look
// keeps the last reading and notes why beside it. Returns 'read' or 'failed'.
export async function lookAtCloudLogin({ transport, storage, key, home = os.homedir(), now = Date.now(), pollWaitMs }) {
  const rec = cloudLoginFor('claude', key, { home });
  if (!rec?.id || rec.broken) return 'failed';
  const end = await session({
    transport,
    pollWaitMs,
    start: { action: 'look', runId: `look-${crypto.randomUUID()}`, engine: 'claude', loginUrl: await storage.getUrl(loginObjectKey('claude', rec.id), LINK_SECONDS) },
  });
  if (end.state !== 'saved') {
    markCloudLogin('claude', key, rec.id, { lookFailedAt: now, lookError: end.message ?? null }, { home });
    return 'failed';
  }
  markCloudLogin('claude', key, rec.id, { org: end.org ?? null, limits: end.limits ?? [], readAt: now }, { home });
  return 'read';
}

/* ------------------------ the first build's tokens ----------------------- */
// The first cloud build kept a Claude token per account in the macOS keychain
// (service below) or, elsewhere, in ~/.agentbox/cloud-tokens.json. Those were
// the app's own copies for the cloud, never Claude Code's own login, and
// nothing reads them now. Deleted once, on start.
export const OLD_KEYCHAIN_SERVICE_SUFFIX = 'cloud: Claude sign-in';
export function forgetOldCloudTokens({ home = os.homedir(), platform = process.platform, service, exec } = {}) {
  try { fs.rmSync(path.join(home, '.agentbox', 'cloud-tokens.json'), { force: true }); } catch { /* none */ }
  if (platform !== 'darwin' || !service || !exec) return;
  // One entry per account; delete until there are none (at most 20).
  for (let i = 0; i < 20; i += 1) {
    try { exec('security', ['delete-generic-password', '-s', service]); } catch { break; }
  }
}

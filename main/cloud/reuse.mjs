// WHAT A CLOUD RUN SENDS ONCE AND THEN REUSES.
//
// Every reply in the cloud is a new machine, but the project's history and
// the account's skills and memories barely change between replies. Each is
// kept in the bucket under a name made from what it holds and sent again only
// when that changes. The history goes as one base shared by every thread of
// the repository, and each run sends only the commits past it (`pickBase`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './exec.mjs';
import { commonGitDirOf, markerPath } from './marker.mjs';

// The bucket deletes everything under `runs/` seven days after it was written
// (scripts/cloud-setup.mjs). Names carry the six-day period they were written
// in and are only reused inside it, so nothing reused is ever that old.
export const CACHE_PERIOD_MS = 6 * 24 * 60 * 60_000;

export const periodOf = (now = Date.now()) => Math.floor(now / CACHE_PERIOD_MS);
export const cacheKey = (name, now = Date.now()) => `runs/cache/${periodOf(now)}/${name}`;

// What a folder holds, as tar -h packs it: every file, following links, by its
// path, size, time and mode. Unchanged files give the same name; any change
// gives a new one.
export async function folderKey(dir) {
  const h = crypto.createHash('sha256');
  const seen = new Set();
  async function walk(d, rel) {
    let real;
    try { real = await fs.promises.realpath(d); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    let names;
    try { names = (await fs.promises.readdir(d)).sort(); } catch { return; }
    for (const name of names) {
      const p = path.join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      let st;
      try { st = await fs.promises.stat(p); } catch { continue; }
      if (st.isDirectory()) await walk(p, r);
      else if (st.isFile()) h.update(`${r}\0${st.size}\0${st.mtimeMs}\0${st.mode}\n`);
    }
  }
  await walk(dir, '');
  return h.digest('hex');
}

// Puts `make()` at `key` unless the bucket already has it. A storage that
// cannot say what it has gets everything sent, as before.
export async function sendOnce(storage, key, make) {
  if (storage.exists && await storage.exists(key).catch(() => false)) return { key, sent: false };
  const body = await make();
  await storage.put(key, body);
  return { key, sent: true };
}

const has = (storage, key) => (storage.exists ? storage.exists(key).catch(() => false) : false);

// S3 copies a part only from 5 MiB, so a conversation smaller than that is
// sent whole every time.
export const MIN_JOIN_BYTES = 5 * 1024 * 1024;

// Where this Mac notes the conversation it last sent from a folder: beside
// the folder's cloud marker.
export function sentRecordPath(here) {
  const marker = markerPath(here);
  return marker ? `${marker.replace(/\.json$/, '')}-sent.json` : null;
}

// The hash of the first `upTo` bytes (null when the file is shorter) and of
// the whole file, in one read.
async function hashes(file, upTo) {
  const whole = crypto.createHash('sha256');
  let prefix = null;
  let seen = 0;
  for await (const chunk of fs.createReadStream(file)) {
    if (prefix === null && upTo > 0 && seen + chunk.length >= upTo) {
      whole.update(chunk.subarray(0, upTo - seen));
      prefix = whole.copy().digest('hex');
      whole.update(chunk.subarray(upTo - seen));
    } else whole.update(chunk);
    seen += chunk.length;
  }
  return { prefix, whole: whole.digest('hex'), size: seen };
}

/**
 * Puts a resumed conversation in the bucket and returns its key. Claude Code
 * only ever adds to one, so once a copy is there only what was added since is
 * sent, and joined to it in the bucket (`storage.extend`). Anything else, a
 * conversation that changed or a copy the bucket no longer has, goes whole.
 * A copy from an earlier period is joined from, never read by the cloud: the
 * join is a new object under this period's name. `record` is where the last
 * send is noted.
 */
export async function sendConversation(storage, file, { record = null, now = Date.now() } = {}) {
  // Hashed and sent from one copy, so the key always names what was sent.
  const copy = path.join(os.tmpdir(), `agentbox-conversation-${crypto.randomUUID()}.jsonl`);
  try {
    fs.copyFileSync(file, copy, fs.constants.COPYFILE_FICLONE);
    let had = null;
    try { had = record ? JSON.parse(fs.readFileSync(record, 'utf8')) : null; } catch { /* none yet */ }
    const joinable = !!storage.extend && Number.isInteger(had?.size)
      && had.size >= MIN_JOIN_BYTES && typeof had.key === 'string' && typeof had.sha === 'string';
    const { prefix, whole, size } = await hashes(copy, joinable ? had.size : 0);
    const key = cacheKey(`conversation-${whole}.jsonl`, now);
    let sent = 0;
    if (!(await has(storage, key))) {
      if (joinable && prefix === had.sha && size > had.size && await has(storage, had.key)) {
        try { await storage.extend(key, had.key, copy, had.size); sent = size - had.size; } catch { /* sent whole below */ }
      }
      if (!sent) {
        if (storage.putFile) await storage.putFile(key, copy);
        else await storage.put(key, fs.readFileSync(copy));
        sent = size;
      }
    }
    if (record) {
      try {
        const tmp = `${record}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify({ period: periodOf(now), key, size, sha: whole }));
        fs.renameSync(tmp, record);
      } catch { /* the next send goes whole */ }
    }
    return { key, size, sent };
  } finally {
    fs.rmSync(copy, { force: true });
  }
}

const git = (cwd, args) => run('git', args, { cwd });
const gitOk = (cwd, args) => git(cwd, args).then(() => true, () => false);

async function mergeBase(cwd) {
  for (const r of ['refs/remotes/origin/main', 'refs/heads/main']) {
    try { return (await git(cwd, ['merge-base', 'HEAD', r])).trim(); } catch { /* not there */ }
  }
  return (await git(cwd, ['rev-parse', 'HEAD'])).trim();
}

const baseRecordPath = (cwd) => {
  const common = commonGitDirOf(cwd);
  return common ? path.join(common, 'agentbox-cloud-base.json') : null;
};

/**
 * The commit this run's history is sent against, and its bundle's name in the
 * bucket. Kept beside the repository so every thread of it shares one base for
 * the period; made afresh, from where the branch meets main, when the period
 * has turned or the bucket no longer has it.
 */
export async function pickBase(cwd, storage, { now = Date.now(), runId = crypto.randomUUID() } = {}) {
  const record = baseRecordPath(cwd);
  const period = periodOf(now);
  let had = null;
  try { had = JSON.parse(fs.readFileSync(record, 'utf8')); } catch { /* none yet */ }
  if (had?.period === period && /^[0-9a-f]{40,64}$/.test(had.sha || '')
    && await gitOk(cwd, ['cat-file', '-e', `${had.sha}^{commit}`])) {
    const key = cacheKey(`base-${had.sha}.bundle`, now);
    if (await storage.exists(key).catch(() => false)) return { sha: had.sha, key, sent: false };
  }
  const sha = await mergeBase(cwd);
  const key = cacheKey(`base-${sha}.bundle`, now);
  let sent = false;
  if (!(await storage.exists(key).catch(() => false))) {
    const ref = `refs/agentbox/cloud-base/${runId}`;
    const file = path.join(os.tmpdir(), `agentbox-cloud-base-${runId}.bundle`);
    try {
      await git(cwd, ['update-ref', ref, sha]);
      await git(cwd, ['bundle', 'create', '-q', file, ref]);
      if (storage.putFile) await storage.putFile(key, file);
      else await storage.put(key, fs.readFileSync(file));
      sent = true;
    } finally {
      fs.rmSync(file, { force: true });
      await gitOk(cwd, ['update-ref', '-d', ref]);
    }
  }
  if (record) {
    try {
      const tmp = `${record}.${process.pid}.${runId}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ period, sha }));
      fs.renameSync(tmp, record);
    } catch { /* the next run makes its own */ }
  }
  return { sha, key, sent };
}

/**
 * The commits of `refs` past `base`, as a bundle file, or null when the base
 * already holds every one of them (git refuses a bundle with nothing in it).
 */
export async function bundlePast(cwd, refs, base, file) {
  const ahead = [];
  for (const r of refs) if (!(await gitOk(cwd, ['merge-base', '--is-ancestor', r, base]))) ahead.push(r);
  if (!ahead.length) return null;
  await git(cwd, ['bundle', 'create', '-q', file, ...ahead, `^${base}`]);
  return file;
}

// Each ref the run takes, with the commit it names, so the cloud can set the
// ones a thin bundle leaves out because the base already holds them.
export async function refsAt(cwd, refs) {
  const out = {};
  for (const r of refs) out[r] = (await git(cwd, ['rev-parse', `${r}^{commit}`])).trim();
  return out;
}

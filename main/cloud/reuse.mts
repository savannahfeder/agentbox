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
import { run } from './exec.mts';
import { commonGitDirOf, markerPath } from './marker.mts';
import type { MarkerFolder } from './marker.mts';
import type { CloudStorage } from './managed.mts';

// The bucket deletes everything under `runs/` seven days after it was written
// (scripts/cloud-setup.mjs). Names carry the six-day period they were written
// in and are only reused inside it, so nothing reused is ever that old.
export const CACHE_PERIOD_MS = 6 * 24 * 60 * 60_000;

export const periodOf = (now: number = Date.now()) => Math.floor(now / CACHE_PERIOD_MS);
export const cacheKey = (name: string, now: number = Date.now()) => `runs/cache/${periodOf(now)}/${name}`;

// What a folder holds, as tar -h packs it: every file, following links, by its
// path, size, time and mode. Unchanged files give the same name; any change
// gives a new one.
export async function folderKey(dir: string) {
  const h = crypto.createHash('sha256');
  const seen = new Set<string>();
  async function walk(d: string, rel: string): Promise<void> {
    let real: string;
    try { real = await fs.promises.realpath(d); } catch { return; }
    if (seen.has(real)) return;
    seen.add(real);
    let names: string[];
    try { names = (await fs.promises.readdir(d)).sort(); } catch { return; }
    for (const name of names) {
      const p = path.join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      let st: fs.Stats;
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
export async function sendOnce(storage: CloudStorage, key: string, make: () => string | Buffer | Promise<string | Buffer>) {
  if (storage.exists && await storage.exists(key).catch(() => false)) return { key, sent: false };
  const body = await make();
  await storage.put(key, body);
  return { key, sent: true };
}

const has = (storage: CloudStorage, key: string) => (storage.exists ? storage.exists(key).catch(() => false) : false);

// S3 copies a part only from 5 MiB, so a conversation smaller than that is
// sent whole every time.
export const MIN_JOIN_BYTES = 5 * 1024 * 1024;

// Where this Mac notes the conversation it last sent from a folder: beside
// the folder's cloud marker.
export function sentRecordPath(here: MarkerFolder) {
  const marker = markerPath(here);
  return marker ? `${marker.replace(/\.json$/, '')}-sent.json` : null;
}

// The hash of the first `upTo` bytes (null when the file is shorter) and of
// the whole file, in one read.
async function hashes(file: string, upTo: number) {
  const whole = crypto.createHash('sha256');
  let prefix: string | null = null;
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
 *
 * A storage that cannot join (the cloud server's) sends what was added as a
 * piece of its own when the image joins pieces itself (`pieces`), and returns
 * every piece's key in order. Every piece is read by the cloud, so all must be
 * from this period.
 */
export interface SentRecord {
  period?: number;
  key?: string;
  size?: number;
  sha?: string;
  pieces?: { key: string; size: number }[];
}

// A chain this long is sent whole once and starts again.
export const MAX_PIECES = 24;

async function chainHad(storage: CloudStorage, had: SentRecord, now: number) {
  const chain = had.pieces ?? [{ key: had.key!, size: had.size! }];
  const here = cacheKey('', now);
  if (!chain.every((p) => typeof p?.key === 'string' && p.key.startsWith(here) && Number.isInteger(p.size))) return null;
  if (chain.reduce((n, p) => n + p.size, 0) !== had.size) return null;
  for (const p of chain) if (!(await has(storage, p.key))) return null;
  return chain;
}

async function writeTail(from: string, start: number) {
  const tail = `${from}.from-${start}`;
  const { pipeline } = await import('node:stream/promises');
  await pipeline(fs.createReadStream(from, { start }), fs.createWriteStream(tail));
  return tail;
}

export async function sendConversation(storage: CloudStorage, file: string, { record = null, now = Date.now(), pieces = false }: { record?: string | null; now?: number; pieces?: boolean } = {}) {
  // Hashed and sent from one copy, so the key always names what was sent.
  const copy = path.join(os.tmpdir(), `agentbox-conversation-${crypto.randomUUID()}.jsonl`);
  try {
    fs.copyFileSync(file, copy, fs.constants.COPYFILE_FICLONE);
    let had: SentRecord | null = null;
    try { had = record ? JSON.parse(fs.readFileSync(record, 'utf8')) : null; } catch { /* none yet */ }
    const chaining = pieces && !storage.extend;
    const joinable = (!!storage.extend || chaining) && Number.isInteger(had?.size)
      && had!.size! >= MIN_JOIN_BYTES && typeof had!.key === 'string' && typeof had!.sha === 'string';
    const { prefix, whole, size } = await hashes(copy, joinable ? had!.size! : 0);
    const key = cacheKey(`conversation-${whole}.jsonl`, now);
    const note = (r: SentRecord) => {
      if (!record) return;
      try {
        const tmp = `${record}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(r));
        fs.renameSync(tmp, record);
      } catch { /* the next send goes whole */ }
    };
    if (chaining && joinable && had!.pieces && had!.sha === whole && size === had!.size) {
      const chain = await chainHad(storage, had!, now);
      if (chain) return { key: chain[0].key, size, sent: 0, pieces: chain.map((p) => p.key) };
    }
    if (chaining && joinable && prefix === had!.sha && size > had!.size!) {
      const chain = await chainHad(storage, had!, now);
      if (chain && chain.length < MAX_PIECES) {
        const tailKey = cacheKey(`conversation-${whole}-from-${had!.size}.jsonl`, now);
        const tail = await writeTail(copy, had!.size!);
        try {
          if (storage.putFile) await storage.putFile(tailKey, tail);
          else await storage.put(tailKey, fs.readFileSync(tail));
        } finally { fs.rmSync(tail, { force: true }); }
        const all = [...chain, { key: tailKey, size: size - had!.size! }];
        note({ period: periodOf(now), key: tailKey, size, sha: whole, pieces: all });
        return { key: all[0].key, size, sent: size - had!.size!, pieces: all.map((p) => p.key) };
      }
    }
    let sent = 0;
    if (!(await has(storage, key))) {
      if (storage.extend && joinable && !had!.pieces && prefix === had!.sha && size > had!.size! && await has(storage, had!.key!)) {
        try { await storage.extend(key, had!.key!, copy, had!.size!); sent = size - had!.size!; } catch { /* sent whole below */ }
      }
      if (!sent) {
        if (storage.putFile) await storage.putFile(key, copy);
        else await storage.put(key, fs.readFileSync(copy));
        sent = size;
      }
    }
    note({ period: periodOf(now), key, size, sha: whole });
    return { key, size, sent };
  } finally {
    fs.rmSync(copy, { force: true });
  }
}

const git = (cwd: string, args: string[]) => run('git', args, { cwd }) as Promise<string>;
const gitOk = (cwd: string, args: string[]) => git(cwd, args).then(() => true, () => false);

async function mergeBase(cwd: string) {
  for (const r of ['refs/remotes/origin/main', 'refs/heads/main']) {
    try { return (await git(cwd, ['merge-base', 'HEAD', r])).trim(); } catch { /* not there */ }
  }
  return (await git(cwd, ['rev-parse', 'HEAD'])).trim();
}

const baseRecordPath = (cwd: string) => {
  const common = commonGitDirOf(cwd);
  return common ? path.join(common, 'agentbox-cloud-base.json') : null;
};

/**
 * The commit this run's history is sent against, and its bundle's name in the
 * bucket. Kept beside the repository so every thread of it shares one base for
 * the period; made afresh, from where the branch meets main, when the period
 * has turned or the bucket no longer has it.
 */
export async function pickBase(cwd: string, storage: CloudStorage, { now = Date.now(), runId = crypto.randomUUID() as string }: { now?: number; runId?: string } = {}) {
  const record = baseRecordPath(cwd);
  const period = periodOf(now);
  let had: { period?: number; sha: string } | null = null;
  try { had = JSON.parse(fs.readFileSync(record!, 'utf8')); } catch { /* none yet */ }
  if (had?.period === period && /^[0-9a-f]{40,64}$/.test(had.sha || '')
    && await gitOk(cwd, ['cat-file', '-e', `${had.sha}^{commit}`])) {
    const key = cacheKey(`base-${had.sha}.bundle`, now);
    if (await storage.exists!(key).catch(() => false)) return { sha: had.sha, key, sent: false };
  }
  const sha = await mergeBase(cwd);
  const key = cacheKey(`base-${sha}.bundle`, now);
  let sent = false;
  if (!(await storage.exists!(key).catch(() => false))) {
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
export async function bundlePast(cwd: string, refs: string[], base: string, file: string) {
  const ahead: string[] = [];
  for (const r of refs) if (!(await gitOk(cwd, ['merge-base', '--is-ancestor', r, base]))) ahead.push(r);
  if (!ahead.length) return null;
  await git(cwd, ['bundle', 'create', '-q', file, ...ahead, `^${base}`]);
  return file;
}

// Each ref the run takes, with the commit it names, so the cloud can set the
// ones a thin bundle leaves out because the base already holds them.
export async function refsAt(cwd: string, refs: string[]) {
  const out: Record<string, string> = {};
  for (const r of refs) out[r] = (await git(cwd, ['rev-parse', `${r}^{commit}`])).trim();
  return out;
}

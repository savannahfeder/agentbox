// A CLOUD RUN WHOSE REQUEST ONLY NEEDS ITS BRANCH MERGED INTO MAIN is merged
// here by the app, with git, instead of by an agent started on this computer
// (tests/a-merge-the-cloud-hands-back-is-done-by-the-app-not-an-agent).
// Anything but a plain merge returns why, and the hand-back runs as before.

import { execFile } from 'node:child_process';
import path from 'node:path';

// The exact line the cloud run is told to end on (main/cloud/run.mts). One that
// asks for more than the merge is an agent's.
const PLAIN = /^merging into main$/i;
export const isPlainMerge = (what) => PLAIN.test(String(what ?? '').trim());

const GIT_MS = 20_000;
const FETCH_MS = 2 * 60_000;
// A push runs the project's own pre-push hook, which may run its tests: a ship's deadline (main/ship-queue.mts).
const PUSH_MS = 20 * 60_000;
// Never a prompt for a password: a fetch or push nobody can answer fails instead.
const NO_PROMPT = { ...process.env, GIT_TERMINAL_PROMPT: '0' };

function git(cwd, args, { timeout = GIT_MS, env = process.env } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, encoding: 'utf8', timeout, env, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve(error
        ? { ok: false, out: `${stdout ?? ''}${stderr ?? ''}`.trim() || String(error.message) }
        : { ok: true, out: String(stdout).trim() });
    });
  });
}

const count = async (cwd, range) => { const r = await git(cwd, ['rev-list', '--count', range]); return r.ok ? Number(r.out) || 0 : null; };

/** Where main is published, as `{ remote, ref }`, or null for a main that lives only here. */
async function publishedAt(base, into) {
  const remote = await git(base, ['config', '--get', `branch.${into}.remote`]);
  const ref = await git(base, ['config', '--get', `branch.${into}.merge`]);
  return remote.ok && ref.ok && remote.out && ref.out ? { remote: remote.out, ref: ref.out } : null;
}

// Main here caught up with the published copy, when that is a plain fast-forward.
async function catchUp(base, { remote }) {
  const fetched = await git(base, ['fetch', '--quiet', remote], { timeout: FETCH_MS, env: NO_PROMPT });
  if (!fetched.ok) return { ok: false, why: `could not reach ${remote} to bring main up to date`, said: fetched.out };
  const ahead = await count(base, '@{u}..HEAD');
  const behind = await count(base, 'HEAD..@{u}');
  if (ahead === null || behind === null) return { ok: false, why: `git could not compare main with ${remote}` };
  if (ahead) return { ok: false, why: `main here has commits that are not on ${remote} yet, and publishing them is not this thread's to decide` };
  if (behind) {
    const ff = await git(base, ['merge', '--ff-only', '@{u}']);
    if (!ff.ok) return { ok: false, why: `git could not bring main up to date with ${remote}`, said: ff.out };
  }
  return { ok: true };
}

const clean = async (cwd) => { const s = await git(cwd, ['status', '--porcelain']); return s.ok && s.out === ''; };

async function mergeNow(cwd, { beforePush = null } = {}) {
  const branch = await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch.ok || branch.out === 'HEAD') return { ok: false, why: "this thread's folder is not on a branch of its own" };
  if (!(await clean(cwd))) return { ok: false, why: "this thread's folder has changes that are not committed" };
  const common = await git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const top = await git(cwd, ['rev-parse', '--show-toplevel']);
  const base = common.ok && path.basename(common.out) === '.git' ? path.dirname(common.out) : null;
  if (!base || !top.ok || path.resolve(base) === path.resolve(top.out)) {
    return { ok: false, why: "this thread works in the project's own folder, not a folder of its own" };
  }
  const into = await git(base, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!into.ok || !['main', 'master'].includes(into.out)) return { ok: false, why: `the project's own folder is on ${into.ok ? into.out : 'no branch'}, not main` };
  if (!(await clean(base))) return { ok: false, why: "the project's own folder has changes that are not committed" };
  const published = await publishedAt(base, into.out);
  if (published) {
    const caught = await catchUp(base, published);
    if (!caught.ok) return caught;
  }
  const commits = await count(base, `HEAD..${branch.out}`);
  if (commits === null) return { ok: false, why: 'git could not compare the branch with main' };
  if (!commits) return { ok: true, commits: 0, into: into.out };
  const merged = await git(base, ['merge', '--no-edit', branch.out]);
  if (!merged.ok) {
    await git(base, ['merge', '--abort']);
    return { ok: false, why: /conflict/i.test(merged.out) ? 'merging it into main conflicts' : 'git refused the merge', said: merged.out };
  }
  if (!published) return { ok: true, commits, into: into.out };
  const giveBack = beforePush ? await beforePush() : null;
  let pushed;
  try {
    pushed = await git(base, ['push', '--quiet', published.remote, `HEAD:${published.ref}`], { timeout: PUSH_MS, env: NO_PROMPT });
  } finally {
    giveBack?.();
  }
  if (!pushed.ok) {
    return { ok: false, merged: true, commits, why: `it is merged into main here, but pushing it to ${published.remote} failed`, said: pushed.out };
  }
  return { ok: true, commits, into: into.out, pushedTo: published.remote };
}

// One at a time, so two threads never merge into the same main at once.
let last = Promise.resolve();

/**
 * Merge the branch checked out in the thread's folder `cwd` into main in the
 * project's own checkout, and push main where it is published. `beforePush`
 * takes a turn at the memory check and answers with what gives it back.
 * `{ ok: true, commits, into, pushedTo? }`, or `{ ok: false, why, said?, merged? }`:
 * main as it was, or merged here when only the push failed.
 */
export function mergeHome(cwd, options = {}) {
  const run = last.then(() => mergeNow(cwd, options)).catch((e) => ({ ok: false, why: String(e?.message ?? e) }));
  last = run;
  return run;
}

/** The thread's answer once the app has merged it. */
export function mergedSentence({ commits, into = 'main', pushedTo = null }) {
  if (!commits) return `**Already on ${into}.** Everything this thread made was on ${into} already, so nothing needed merging.`;
  const them = commits === 1 ? 'The commit this thread made is' : `The ${commits} commits this thread made are`;
  if (pushedTo) return `**Merged into ${into} and pushed.** ${them} on ${into} here and on ${pushedTo} now.`;
  return `**Merged into ${into}.** ${them} on ${into} now, merged on this computer.`;
}

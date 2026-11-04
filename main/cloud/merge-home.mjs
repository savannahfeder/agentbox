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

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, encoding: 'utf8', timeout: GIT_MS }, (error, stdout, stderr) => {
      resolve(error
        ? { ok: false, out: `${stdout ?? ''}${stderr ?? ''}`.trim() || String(error.message) }
        : { ok: true, out: String(stdout).trim() });
    });
  });
}

const clean = async (cwd) => { const s = await git(cwd, ['status', '--porcelain']); return s.ok && s.out === ''; };

async function mergeNow(cwd) {
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
  // A main with an upstream is published, and publishing is the project's own
  // process (its hooks, its pull requests), which an agent follows.
  if ((await git(base, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).ok) {
    return { ok: false, why: 'main is published to another copy, and pushing it is left to an agent' };
  }
  if (!(await clean(base))) return { ok: false, why: "the project's own folder has changes that are not committed" };
  const count = await git(base, ['rev-list', '--count', `HEAD..${branch.out}`]);
  if (!count.ok) return { ok: false, why: 'git could not compare the branch with main', said: count.out };
  const commits = Number(count.out) || 0;
  if (!commits) return { ok: true, commits: 0, into: into.out };
  const merged = await git(base, ['merge', '--no-edit', branch.out]);
  if (!merged.ok) {
    await git(base, ['merge', '--abort']);
    return { ok: false, why: /conflict/i.test(merged.out) ? 'merging it into main conflicts' : 'git refused the merge', said: merged.out };
  }
  return { ok: true, commits, into: into.out };
}

// One at a time, so two threads never merge into the same main at once.
let last = Promise.resolve();

/**
 * Merge the branch checked out in the thread's folder `cwd` into main in the
 * project's own checkout. `{ ok: true, commits, into }`, or `{ ok: false, why, said? }`
 * with main as it was.
 */
export function mergeHome(cwd) {
  const run = last.then(() => mergeNow(cwd)).catch((e) => ({ ok: false, why: String(e?.message ?? e) }));
  last = run;
  return run;
}

/** The thread's answer once the app has merged it. */
export function mergedSentence({ commits, into = 'main' }) {
  if (!commits) return `**Already on ${into}.** Everything this thread made was on ${into} already, so nothing needed merging.`;
  const them = commits === 1 ? 'The commit this thread made is' : `The ${commits} commits this thread made are`;
  return `**Merged into ${into}.** ${them} on ${into} now, merged on this computer.`;
}

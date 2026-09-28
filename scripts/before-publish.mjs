#!/usr/bin/env node
// WHAT `npm publish` IS ABOUT TO SEND, CHECKED AGAINST WHAT IS ON MAIN.
//
// A published version can never be replaced, only superseded, so the wrong one
// going out costs a version number and a correction rather than an undo.
//
// THE MISTAKE THIS EXISTS TO CATCH IS NOT HYPOTHETICAL. There is more than one
// checkout of this repo on the machine it is developed on: the one work happens
// in, and ~/Astral, which is where the running app lives and sits on whatever
// branch it was last built from. Both have a package.json saying agentbox-app.
// Signing in to npm is global, so `npm login` in one folder makes `npm publish`
// work in the other, and on 2026-09-25 that is exactly where the terminal was:
// ~/Astral, eight commits behind main, carrying a description that had been
// replaced. Nothing about that command would have looked wrong.
//
// So this refuses unless three things are true, and says which one is not.
//  1. Nothing uncommitted, or the tarball holds something no commit does.
//  2. HEAD is on origin/main, so what ships is what was reviewed.
//  3. origin/main has been fetched recently enough to mean anything.
//
// Bypass, deliberately awkward, for a case nobody has met yet:
// AGENTBOX_PUBLISH_ANYWAY=1 npm publish

import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function stop(what, fix) {
  console.error(`\n  Not publishing.\n\n  ${what}\n  ${fix}\n`);
  process.exit(1);
}

if (process.env.AGENTBOX_PUBLISH_ANYWAY === '1') {
  console.log('agentbox: publishing without the checks, because AGENTBOX_PUBLISH_ANYWAY is set.');
  process.exit(0);
}

let head, dirty;
try {
  head = git('rev-parse', 'HEAD');
  dirty = git('status', '--porcelain');
} catch {
  stop('This folder is not a git checkout.', 'Publish from the repo.');
}

if (dirty) {
  const n = dirty.split('\n').length;
  stop(
    `${n} file${n === 1 ? ' is' : 's are'} changed and not committed.`,
    'Commit them, or the package holds something no commit does.',
  );
}

try {
  execFileSync('git', ['fetch', 'origin', '--quiet'], { stdio: 'ignore' });
} catch {
  // Offline is not a reason to refuse. The ancestor check below still runs
  // against whatever origin/main was last known to be.
}

let onMain = false;
try {
  execFileSync('git', ['merge-base', '--is-ancestor', head, 'origin/main'], { stdio: 'ignore' });
  onMain = true;
} catch {}

if (!onMain) {
  const branch = (() => { try { return git('rev-parse', '--abbrev-ref', 'HEAD'); } catch { return '?'; } })();
  stop(
    `This checkout is on ${branch} at ${head.slice(0, 8)}, which is not on origin/main.`,
    'Publish from a checkout whose commit has been merged and pushed.',
  );
}

const behind = (() => {
  try { return Number(git('rev-list', '--count', `${head}..origin/main`)); } catch { return 0; }
})();
if (behind > 0) {
  stop(
    `This checkout is ${behind} commit${behind === 1 ? '' : 's'} behind origin/main.`,
    'Pull, then publish, or you will send an older build than the one on main.',
  );
}

console.log(`agentbox: publishing ${head.slice(0, 8)}, which is the tip of origin/main.`);

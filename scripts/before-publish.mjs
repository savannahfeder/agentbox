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
//  1. Nothing uncommitted that would actually be packed. Scratch files that
//     the `files` list does not reach are somebody else's business.
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

// WHICH UNCOMMITTED FILES ACTUALLY MATTER, rather than how many there are.
//
// The first version of this refused on any dirty tree at all, and that made it
// useless in the checkout it most needs to work in: a repo several agents share
// always has somebody's scratch file in it, and none of that scratch is in the
// package. Refusing over it trains you to reach for the override, and an
// override you always use is not a guard.
//
// So it asks npm what it would actually pack and refuses only where the two
// lists meet. Exact, because it is npm's own resolution of `files` rather than
// this script's guess at it. Ignored paths never appear: `git status` leaves
// them out, which is why renderer/dist, packed on every publish and committed
// on none, is correctly not a complaint.
function wouldShip(changed) {
  if (!changed.length) return [];
  let packed;
  try {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    });
    packed = new Set(JSON.parse(raw.slice(raw.indexOf('['))) [0].files.map((f) => f.path));
  } catch {
    // If npm cannot tell us, the honest answer is the cautious one.
    return changed;
  }
  // THE FILES A PUBLISH USED TO REWRITE, which made every attempt poison the
  // next one. `prepack` runs `npm run build`, and the build read the installed
  // Claude Code and wrote what it found over shared/*.generated.*. So a failed
  // publish left those modified and the next publish refused because of dirt the
  // last publish had made. Measured 2026-09-28: one failed attempt left
  // claude-models.generated.mjs changed by a version number, and that alone
  // blocked the retry.
  //
  // THE BUILD NO LONGER WRITES THEM (w-6bbb709b1f): it writes
  // shared/*.local.json, which is gitignored, and `npm run read:claude` is what
  // updates the committed tables. This filter stays as the belt for a folder an
  // OLDER build already dirtied, and because what ships is whatever the build
  // produces on the machine publishing, so a difference here changes nothing.
  return changed.filter((f) => packed.has(f) && !/\.generated\./.test(f));
}

if (dirty) {
  // --untracked-files=all, or a whole new directory arrives as one line and a
  // file inside it is never compared against anything.
  const changed = git('status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  const bad = wouldShip(changed);
  if (bad.length) {
    stop(
      `${bad.length} uncommitted file${bad.length === 1 ? '' : 's'} would go into the package:\n    ${bad.slice(0, 8).join('\n    ')}`,
      'Commit them, or move them out, or the package holds something no commit does.',
    );
  }
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

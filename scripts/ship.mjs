// ONE WAY TO SHIP, SO THAT EVERY AGENT DOES THE SAME THING (w-57034cf3c0).
//
// Several agents work this repository at once. Shipping by hand, each in its
// own order, is how a commit ended up living only in the folder the app runs
// from, how a push went out and had to be unpicked, and how main moving mid-run
// turned into a half-finished merge somebody else had to find.
//
//   npm run ship
//
// Fetch, merge what moved, push. If the push is rejected because somebody
// pushed while the tests were running, do all of it again rather than leaving
// the branch half-shipped. Three attempts, then it stops and says so.
//
// IT NEVER SKIPS THE HOOK. The pre-push hook is where the tests and the
// public-repository check live, and they are the point. This script is the
// order of operations, not a replacement for the gates.
//
// AND IT DOES NOT RUN THE TESTS ITSELF (w-9e4d3f3cc1, 2026-10-19). It used to
// run them here and then push, and the push runs the hook, which ran the same
// set again: every ship paid for its gate twice, 12 minutes of it on a core
// file. The hook's run is the one that was kept, because a push cannot get
// around it and because it already runs a red file again on its own before
// refusing, which this one never did.
//
// IT NEVER REACHES INTO ANOTHER CHECKOUT. The folder the app runs from follows
// the public main by fast-forward, on its own; a script writing into it is the
// habit that put unshipped work there.
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { racedWithAnotherPush, notReadyToShip } from './lib/ship-rules.mjs';

// THE FOLDER IT SHIPS IS THE ONE IT RUNS IN. `npm run ship` runs in the
// package root, so a person or agent in a worktree ships that worktree as
// before; Agentbox runs the copy in the app folder (which only ever
// fast-forwards to the remote) against a task's folder, so a branch cannot
// change the code that ships it (main/ship-queue.mjs).
const root = (() => { try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: process.cwd(), encoding: 'utf8' }).trim(); } catch { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); } })();
const PUBLIC = 'origin';
const ATTEMPTS = 3;

const say = (msg) => console.log(`ship: ${msg}`);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const gitSoft = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
const stop = (msg) => { console.error(`\nship: ${msg}\n`); process.exit(1); };

const gitDir = git('rev-parse', '--absolute-git-dir');
const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');

git('fetch', PUBLIC, '--quiet');

const why = notReadyToShip({
  isPrimaryWorktree: gitDir === commonDir,
  dirty: git('status', '--porcelain') !== '',
  onMain: branch === 'main',
  hasCommits: git('rev-list', '--count', `${PUBLIC}/main..HEAD`) !== '0',
});
if (why) stop(why);

function mergeWhatMoved() {
  if (git('rev-list', '--count', `HEAD..${PUBLIC}/main`) === '0') return;
  say(`${PUBLIC}/main has moved. Merging it in.`);
  const merged = gitSoft('merge', `${PUBLIC}/main`, '-m', `Merge ${PUBLIC}/main into ${branch}`);
  if (merged.status !== 0) {
    gitSoft('merge', '--abort');
    stop(`${PUBLIC}/main and this branch disagree and the merge was left for you:\n\n${merged.stdout}${merged.stderr}\n`
      + `  git merge ${PUBLIC}/main   # then fix the conflicts, commit, and run npm run ship again`);
  }
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  mergeWhatMoved();
  say(`pushing to ${PUBLIC} main (attempt ${attempt} of ${ATTEMPTS}). The hook runs the tests and the public check now.`);
  // ROOM FOR THE WHOLE TEST RUN TO COME BACK THROUGH HERE. The only test run a
  // ship has is the hook's, inside this push, so this buffer now carries every
  // failure anybody will read: node's default is a megabyte, and a truncated
  // one returns no status at all and would be read as a refusal with no reason.
  const pushed = spawnSync('git', ['push', PUBLIC, 'HEAD:main'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(pushed.stdout ?? '');
  process.stderr.write(pushed.stderr ?? '');
  if (pushed.status === 0) {
    const sha = git('rev-parse', '--short', 'HEAD');
    say(`shipped ${sha}.`);
    say('the app folder follows on its own: git fetch origin && git merge --ff-only refs/remotes/origin/main');
    say(`check the run: gh run list -R savannahfeder/agentbox -L 3`);
    process.exit(0);
  }
  if (!racedWithAnotherPush(`${pushed.stdout ?? ''}${pushed.stderr ?? ''}`)) {
    stop('that push was refused rather than raced, so nothing was retried. The reason is above.');
  }
  say('somebody pushed first. Fetching what they did and going round again.');
  git('fetch', PUBLIC, '--quiet');
}

stop(`${ATTEMPTS} attempts and main moved every time. Something is pushing constantly; try again in a minute.`);

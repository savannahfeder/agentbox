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
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { racedWithAnotherPush, notReadyToShip, runsEveryTest, startedWhenBusy } from './lib/ship-rules.mjs';
import { deployAfterShip } from './lib/web-app-deploy.mjs';

// THE FOLDER IT SHIPS IS THE ONE IT RUNS IN. `npm run ship` runs in the
// package root, so a person or agent in a worktree ships that worktree as
// before; Agentbox runs the copy in the app folder (which only ever
// fast-forwards to the remote) against a task's folder, so a branch cannot
// change the code that ships it (main/ship-queue.mts).
const runGit = (args, opts) => startedWhenBusy(() => spawnSync('git', args, { encoding: 'utf8', ...opts }));
const gitOrThrow = (args, opts) => {
  const r = runGit(args, opts);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed (${r.status}):\n${r.stderr ?? ''}`);
  return r.stdout.trim();
};
const root = (() => { try { return gitOrThrow(['rev-parse', '--show-toplevel'], { cwd: process.cwd() }); } catch { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); } })();
const PUBLIC = 'origin';
const ATTEMPTS = 3;
// The ship queue stops a ship at 20 minutes, or 60 once this script says the
// hook runs every test (main/ship-queue.mts); the web app's deploy ends before that.
const began = Date.now();
let shipEndsBy = began + 18 * 60_000;

const say = (msg) => console.log(`ship: ${msg}`);
const git = (...args) => gitOrThrow(args, { cwd: root });
const gitSoft = (...args) => runGit(args, { cwd: root });
// process.exit drops whatever a pipe has not yet taken, and the ship queue
// reads this script through one: the end of the hook's output, where the
// failing test is named, was what got dropped. Exits once both have drained.
const drained = (stream) => new Promise((resolve) => stream.write('', resolve));
const exit = async (code) => { await drained(process.stdout); await drained(process.stderr); process.exit(code); };
const stop = (msg) => { console.error(`\nship: ${msg}\n`); return exit(1); };

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
if (why) await stop(why);

async function mergeWhatMoved() {
  if (git('rev-list', '--count', `HEAD..${PUBLIC}/main`) === '0') return;
  say(`${PUBLIC}/main has moved. Merging it in.`);
  const merged = gitSoft('merge', `${PUBLIC}/main`, '-m', `Merge ${PUBLIC}/main into ${branch}`);
  if (merged.status !== 0) {
    gitSoft('merge', '--abort');
    await stop(`${PUBLIC}/main and this branch disagree and the merge was left for you:\n\n${merged.stdout}${merged.stderr}\n`
      + `  git merge ${PUBLIC}/main   # then fix the conflicts, commit, and run npm run ship again`);
  }
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  await mergeWhatMoved();
  if (runsEveryTest(git('diff', '--name-status', `${PUBLIC}/main`, 'HEAD'))) {
    say('the hook runs every test for this push, because it deletes code or changes what every test depends on.');
    shipEndsBy = began + 58 * 60_000;
  }
  say(`pushing to ${PUBLIC} main (attempt ${attempt} of ${ATTEMPTS}). The hook runs the tests and the public check now.`);
  // ROOM FOR THE WHOLE TEST RUN TO COME BACK THROUGH HERE. The only test run a
  // ship has is the hook's, inside this push, so this buffer now carries every
  // failure anybody will read: node's default is a megabyte, and a truncated
  // one returns no status at all and would be read as a refusal with no reason.
  const pushed = runGit(['push', PUBLIC, 'HEAD:main'], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  // In that order, so git's own refusal and this script's come after the test run.
  process.stdout.write(pushed.stdout ?? '');
  await drained(process.stdout);
  process.stderr.write(pushed.stderr ?? '');
  if (pushed.status === 0) {
    const sha = git('rev-parse', '--short', 'HEAD');
    say(`shipped ${sha}.`);
    say('the app folder follows on its own: git fetch origin && git merge --ff-only refs/remotes/origin/main');
    say(`check the run: gh run list -R savannahfeder/agentbox -L 3`);
    // Shipped whatever happens here; a deploy that did not work says so.
    try { await deployAfterShip({ root, say, until: shipEndsBy }); } catch (err) { say(`the web app was not updated: ${err?.message ?? err}. Put it up with: npm run phone:deploy`); }
    await exit(0);
  }
  if (!racedWithAnotherPush(`${pushed.stdout ?? ''}${pushed.stderr ?? ''}`)) {
    await stop('that push was refused rather than raced, so nothing was retried. The reason is above.');
  }
  say('somebody pushed first. Fetching what they did and going round again.');
  git('fetch', PUBLIC, '--quiet');
}

await stop(`${ATTEMPTS} attempts and main moved every time. Something is pushing constantly; try again in a minute.`);

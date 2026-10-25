// TURNS THE PRE-PUSH HOOK ON, IN WHATEVER CHECKOUT THIS IS.
//
// Git refuses to version .git/hooks, so the hook lives in scripts/hooks, which
// IS versioned, and this points git at it.
//
// It runs from `npm install` through the `prepare` script, so any checkout that
// installs its dependencies gets the hook without anyone remembering to.
//
// IT NEVER FAILS THE INSTALL. A tarball with no .git, a machine with no git on
// the PATH, a read-only config: every one of those says so and exits 0. An
// install that dies over a hook is worse than a missing hook.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_DIR = 'scripts/hooks';

const say = (msg) => console.log(`hooks: ${msg}`);

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

try {
  git(['rev-parse', '--git-dir']);
} catch {
  say('not a git checkout, so there is nothing to install. Carrying on.');
  process.exit(0);
}

// AN ABSOLUTE PATH, NOT 'scripts/hooks'. Git resolves a relative hooksPath
// against whatever working tree runs the command, so the same shared config
// pointed every task folder at ITS OWN scripts/hooks -- a worker's to edit, and
// run as the app by any git the app ran there. Resolved off the COMMON dir so a
// linked worktree points at the primary checkout's hooks, not its own.
let hooksPath;
try {
  const common = git(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  hooksPath = path.resolve(common, '..', HOOKS_DIR);
} catch (err) {
  say(`could not resolve the hooks directory (${err.message.split('\n')[0]}). No hook installed.`);
  process.exit(0);
}

const hook = path.join(hooksPath, 'pre-push');
if (!fs.existsSync(hook)) {
  say(`${hook} is missing, so nothing was turned on.`);
  process.exit(0);
}

// The file is executable in the repo, but a checkout on a filesystem that drops
// the bit would leave git silently skipping the hook.
try {
  fs.chmodSync(hook, 0o755);
} catch {
  /* not fatal: git will say so itself if it cannot run the hook */
}

try {
  const current = (() => {
    try { return git(['config', '--get', 'core.hooksPath']); } catch { return ''; }
  })();
  if (current === hooksPath) {
    say('the pre-push hook is already on. The whole suite runs before any push.');
    process.exit(0);
  }
  // The old relative default is the one value this script replaces; anything
  // else somebody chose on purpose and is left alone.
  if (current && current !== HOOKS_DIR) {
    say(`core.hooksPath is set to "${current}", which somebody chose on purpose. Leaving it alone.`);
    process.exit(0);
  }
  git(['config', 'core.hooksPath', hooksPath]);
  say('pre-push hook is on. The whole suite now runs before any push from this checkout.');
} catch (err) {
  say(`could not set core.hooksPath (${err.message.split('\n')[0]}). No hook installed.`);
}

// A SHIP RUNS NOTHING FROM A REPOSITORY NESTED IN THE TASK FOLDER.
//
// A Codex worker's sandbox protects only its folder's top-level .git, so a
// repository it makes inside the folder, settings and all, is its own. Once
// that repository is a gitlink on the branch (the app's own `git add -A` of a
// worker's leftovers makes one), scripts/ship.mjs's `git status` looked inside
// it and ran its core.fsmonitor and clean filter on the Mac, outside the
// sandbox. Reproduced with the real script on a throwaway repository
// (security review, 2026-11-21).

import { afterEach, beforeEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScript } from '../main/ship-queue.mts';

const SHIP_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ship.mjs');
const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@example.com' };
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let tmp: string; let task: string; let marker: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-nested-'));
  marker = path.join(tmp, 'ran');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  const base = path.join(tmp, 'base');
  git(tmp, 'init', '-q', '-b', 'main', 'base');
  git(base, 'remote', 'add', 'origin', path.join(tmp, 'origin.git'));
  fs.writeFileSync(path.join(base, 'readme.txt'), 'hello\n');
  git(base, 'add', '.');
  git(base, 'commit', '-q', '-m', 'init');
  git(base, 'push', '-q', 'origin', 'main');
  const hooks = path.join(base, 'scripts', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(path.join(hooks, 'pre-push'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  task = path.join(tmp, 'w-mine');
  git(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-mine', task, 'main');
  const inner = path.join(task, 'bar');
  git(task, 'init', '-q', inner);
  fs.writeFileSync(path.join(inner, 'a.txt'), 'hi\n');
  fs.writeFileSync(path.join(inner, '.gitattributes'), '*.txt filter=x\n');
  git(inner, 'add', '.');
  git(inner, 'commit', '-q', '-m', 'a');
  git(task, 'add', 'bar');
  git(task, 'commit', '-q', '-m', 'A repository of its own');
  const planted = path.join(tmp, 'planted.sh');
  fs.writeFileSync(planted, `#!/bin/sh\ntouch '${marker}'\ncat\n`, { mode: 0o755 });
  git(inner, 'config', 'core.fsmonitor', planted);
  git(inner, 'config', 'filter.x.clean', planted);
  // Newer than the index, so git has to read the file again.
  const later = new Date(Date.now() + 5_000);
  fs.utimesSync(path.join(inner, 'a.txt'), later, later);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

it('ships the branch without running the nested repository\'s settings', async () => {
  const { code, out } = await runScript(SHIP_SCRIPT, task, { env });
  expect(fs.existsSync(marker)).toBe(false);
  expect(code, out).toBe(0);
});

it('still refuses a task folder with work nobody committed', async () => {
  fs.writeFileSync(path.join(task, 'readme.txt'), 'changed\n');
  const { code } = await runScript(SHIP_SCRIPT, task, { env });
  expect(code).toBe(1);
  expect(fs.existsSync(marker)).toBe(false);
});

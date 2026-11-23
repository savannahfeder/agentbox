// Weekly security audit, 2026-11-16. The ship pins core.hooksPath to the base
// checkout's scripts/hooks, but found that checkout by asking the task folder
// for its git-common-dir. The task folder's `.git` is a file the worker can
// rewrite. Pointed at a worktree entry of a repository the worker made (inside
// its own gitignored node_modules), the ship ran the worker's pre-push hook,
// with the GitHub push token in its environment, and never the base's. Measured
// with the app's runScript on dummy repos: the worker hook printed the token.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runScript } from '../main/ship-queue.mts';

let tmp = '', base = '', task = '', leak = '', script = '';
const g = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8' }).trim();
const hook = (dir: string, who: string) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'pre-push'), `#!/bin/sh\necho "${who} token=\${GIT_AGENTBOX_GITHUB_TOKEN:-unset}" >> "${leak}"\nexit 1\n`);
  fs.chmodSync(path.join(dir, 'pre-push'), 0o755);
};
const ship = () => runScript(script, task, { env: { ...process.env, GIT_AGENTBOX_GITHUB_TOKEN: 'dummy-token-123' }, timeout: 30_000, base });
const leaked = () => { try { return fs.readFileSync(leak, 'utf8'); } catch { return ''; } };

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ship-hooks-')));
  leak = path.join(tmp, 'leak.txt');
  g(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  base = path.join(tmp, 'base');
  g(tmp, 'init', '-q', '-b', 'main', base);
  fs.writeFileSync(path.join(base, '.gitignore'), 'node_modules/\n');
  fs.writeFileSync(path.join(base, 'a.txt'), 'a\n');
  fs.writeFileSync(path.join(base, 'ship.mjs'), "import { execFileSync } from 'node:child_process';\ntry { execFileSync('git', ['push', '-q', 'origin', 'HEAD:main'], { stdio: 'ignore' }); } catch { process.exit(1); }\n");
  g(base, 'add', '-A'); g(base, 'commit', '-qm', 'init');
  g(base, 'remote', 'add', 'origin', path.join(tmp, 'origin.git')); g(base, 'push', '-q', 'origin', 'main');
  hook(path.join(base, 'scripts', 'hooks'), 'BASE');
  script = path.join(base, 'ship.mjs');
  task = path.join(tmp, 'task');
  g(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-1', task);
  fs.writeFileSync(path.join(task, 'a.txt'), 'b\n'); g(task, 'commit', '-qam', 'work');
});

afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe("a ship's hooks come from the approved checkout, not the task folder", () => {
  it("runs the base checkout's hook for an ordinary task folder", async () => {
    await ship();
    expect(leaked()).toContain('BASE token=dummy-token-123');
  });

  it("never runs a hook from a repository the task folder's .git was pointed at", async () => {
    fs.rmSync(leak, { force: true });
    const evil = path.join(task, 'node_modules', '.e', 'evil');
    g(tmp, 'clone', '-q', base, evil);
    g(evil, 'worktree', 'add', '-q', path.join(task, 'node_modules', '.e', 'wt'), '-b', 'agentbox/w-1', 'origin/agentbox/w-1');
    hook(path.join(evil, 'scripts', 'hooks'), 'WORKER');
    fs.writeFileSync(path.join(task, '.git'), `gitdir: ${path.join(evil, '.git', 'worktrees', 'wt')}\n`);
    const ran = await ship();
    expect(leaked()).not.toContain('WORKER');
    expect(ran.code).not.toBe(0);
  });
});

// A SHIP IS REFUSED ONLY FOR TESTS IT TURNED RED, NOT ONES ALREADY RED ON MAIN.
//
// When main went red, every other branch's ship bounced on the same tests:
// 5614801f and ce30416b on 2026-10-24 were both agents stopping their own work
// to fix tests somebody else had broken. Measured by running the real pre-push
// hook with a stand-in vitest whose only red file was one main is known red
// on: the hook refused the push.
//
// The app knows which tests are red on main (main/main-went-red.mjs keeps
// them, and a thread is already fixing them), so the ship queue hands that
// list to the hook, and the hook leaves those out of its refusal. Anything
// else still red refuses the push as before, and with no list nothing changes.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(root, 'scripts/hooks/pre-push');
const ZERO = '0000000000000000000000000000000000000000';
const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-red-on-main-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** A vitest whose first run fails `red` and whose retry still fails `stillRed`, writing the json report each time. */
function standInVitest({ red, stillRed }) {
  const bin = path.join(dir, 'node_modules/.bin/vitest');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  for (const name of red) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), '// a red test\n');
  }
  const report = (names) => JSON.stringify({
    testResults: names.map((name) => ({ name: path.join(dir, name), status: 'failed', assertionResults: [{ status: 'failed', title: 'red' }] })),
  });
  const calls = path.join(dir, 'vitest-calls');
  fs.writeFileSync(bin, [
    '#!/bin/sh',
    `echo "$@" >> "${calls}"`,
    `n=$(wc -l < "${calls}" | tr -d " ")`,
    `if [ "$n" -eq 1 ]; then out='${report(red)}'; code=1; else out='${report(stillRed)}'; code=${stillRed.length ? 1 : 0}; fi`,
    'for a in "$@"; do',
    '  case "$a" in --outputFile.json=*) printf "%s" "$out" > "${a#--outputFile.json=}" ;; esac',
    'done',
    'exit $code',
  ].join('\n') + '\n');
  fs.chmodSync(bin, 0o755);
}

function runHook(env = {}) {
  const hook = path.join(dir, 'pre-push');
  fs.copyFileSync(HOOK, hook);
  fs.chmodSync(hook, 0o755);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(root, 'scripts/red-test-files.mjs'), path.join(dir, 'scripts/red-test-files.mjs'));
  fs.cpSync(path.join(root, 'scripts/lib'), path.join(dir, 'scripts/lib'), { recursive: true });
  const r = spawnSync(hook, [], {
    cwd: dir, input: `refs/heads/main ${SHA} refs/heads/main ${ZERO}\n`, encoding: 'utf8',
    env: { ...process.env, AGENTBOX_PUSH_FULL_SUITE: '', AGENTBOX_RED_ON_MAIN: '', ...env },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('the push gate, while main is red', () => {
  it('lets a push through whose only red tests are already red on main', () => {
    standInVitest({ red: ['tests/red-on-main.test.mjs'], stillRed: ['tests/red-on-main.test.mjs'] });
    const { code, out } = runHook({ AGENTBOX_RED_ON_MAIN: 'tests/red-on-main.test.mjs\ntests/another.test.mjs' });
    expect(code).toBe(0);
    expect(out).toContain('already red on main');
    expect(out).toContain('tests/red-on-main.test.mjs');
    expect(out).not.toContain('PUSH REFUSED');
  });

  it('refuses a push that turned a test red that main is not red on, and names only that one', () => {
    standInVitest({ red: ['tests/red-on-main.test.mjs', 'tests/mine.test.mjs'], stillRed: ['tests/red-on-main.test.mjs', 'tests/mine.test.mjs'] });
    const { code, out } = runHook({ AGENTBOX_RED_ON_MAIN: 'tests/red-on-main.test.mjs' });
    expect(code).toBe(1);
    expect(out).toContain('PUSH REFUSED');
    expect(out).toMatch(/not red on main:\s+tests\/mine\.test\.mjs/);
  });

  it('matches whole names, so a test whose name contains a red one is still this push\'s', () => {
    standInVitest({ red: ['tests/red-on-main-too.test.mjs'], stillRed: ['tests/red-on-main-too.test.mjs'] });
    const { code } = runHook({ AGENTBOX_RED_ON_MAIN: 'tests/red-on-main' });
    expect(code).toBe(1);
  });

  it('refuses exactly as before when nobody says main is red', () => {
    standInVitest({ red: ['tests/red-on-main.test.mjs'], stillRed: ['tests/red-on-main.test.mjs'] });
    const { code, out } = runHook();
    expect(code).toBe(1);
    expect(out).toContain('PUSH REFUSED');
  });
});

describe('the ship queue', () => {
  let userDir;
  beforeEach(() => { userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-red-on-main-user-')); });
  afterEach(() => { fs.rmSync(userDir, { recursive: true, force: true }); });

  async function shipOnce() {
    const { ShipQueue } = await import('../main/ship-queue.mjs');
    const folders = path.join(dir, 'folders');
    fs.mkdirSync(path.join(folders, 'w-a'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'ship.mjs'), '');
    fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ myproduct: { script: 'scripts/ship.mjs' } }));
    const envs = [];
    const q = new ShipQueue({
      store: { shipped() {}, shipFailed() {} },
      userDir,
      folderFor: (item) => path.join(folders, item.id),
      isLive: () => false,
      run: async (_script, _cwd, opts = {}) => { envs.push(opts.env ?? process.env); return { code: 0, out: 'ship: shipped b1ee16f.\n' }; },
    });
    await q.tick([{ id: 'w-a', product: 'myproduct', status: 'blocked', labels: ['ship'], updatedAt: 1 }], [{ slug: 'myproduct', repoPath: dir }]);
    return envs;
  }

  it('hands the hook the tests main is known red on', async () => {
    fs.writeFileSync(path.join(userDir, 'main-tests.json'), JSON.stringify({ red: { id: 'w-fix', tests: ['tests/one.test.mjs', 'tests/two.test.mjs'] } }));
    const [env] = await shipOnce();
    expect(env.AGENTBOX_RED_ON_MAIN).toBe('tests/one.test.mjs\ntests/two.test.mjs');
    expect(env.PATH).toBe(process.env.PATH);
  });

  it('hands it nothing when main is not known red', async () => {
    const [env] = await shipOnce();
    expect(env.AGENTBOX_RED_ON_MAIN).toBeFalsy();
  });
});

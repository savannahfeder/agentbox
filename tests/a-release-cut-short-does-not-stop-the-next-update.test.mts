// A RELEASE CUT SHORT DOES NOT STOP THE NEXT UPDATE.
//
// What broke (2026-11-12, found checking w-0e77857f54): a fix shipped to main,
// and the thread it was for failed the same way an hour later, because the app
// was still running code from that morning. Its folder was 39 commits behind
// main. `npm run deploy` writes the new version and the counting key into
// package.json for its run and puts the file back when it ends, but this
// morning's run was cut short before it could. That left one line of
// package.json changed, so the updater read the folder as "changes of your
// own" and offered no update, and no ship after the release reached the app.
// The next deploy cleans the leftover up (a-deploy-cut-short-does-not-block-
// the-next-one), but nothing else did.
//
// A package.json that differs from the committed one only in what a deploy
// writes there is the deploy's, not hers: it does not block an update and it
// is put back before the fast-forward. Any other edit to package.json still
// blocks.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSourceUpdater } from '../main/source-updater.mts';

const git = (cwd, ...args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
}).trim();

let tmp;
let mine;
let theirs;

const PKG = { name: 'a', version: '1.0.0', engines: { node: '>=22' } };
const text = (o) => `${JSON.stringify(o, null, 2)}\n`;

function commit(cwd, file, body, message) {
  fs.writeFileSync(path.join(cwd, file), body);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
}

const push = () => git(theirs, 'push', '-q', 'origin', 'main');
const leave = (o) => fs.writeFileSync(path.join(mine, 'package.json'), text(o));

function make() {
  const relaunched = [];
  const u = createSourceUpdater({
    appDir: mine,
    log: { info() {}, warn() {}, error() {} },
    npm: async () => ({ code: 0, out: '' }),
    relaunch: () => relaunched.push(true),
  });
  return { u, relaunched };
}

async function restarted(relaunched) {
  for (let i = 0; i < 100 && !relaunched.length; i += 1) await new Promise((r) => setTimeout(r, 100));
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-updater-release-'));
  const origin = path.join(tmp, 'origin.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(tmp, 'seed');
  git(tmp, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, 'package.json', text(PKG), 'First');
  git(seed, 'push', '-q', 'origin', 'main');
  mine = path.join(tmp, 'mine');
  theirs = path.join(tmp, 'theirs');
  git(tmp, 'clone', '-q', origin, mine);
  git(tmp, 'clone', '-q', origin, theirs);
  commit(theirs, 'a.txt', 'a\n', 'A fix');
  push();
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('package.json left by a release that was cut short', () => {
  it('with only the counting key added, an update is still offered (the reported case)', async () => {
    leave({ ...PKG, bakedPosthogKey: 'phc_test' });
    const s = await make().u.check();
    expect(s.phase).toBe('ready');
    expect(s.error ?? null).toBe(null);
  });

  it('with the next version and the key, it is put back and the update goes through', async () => {
    leave({ ...PKG, version: '1.0.1', bakedPosthogKey: 'phc_test' });
    const { u, relaunched } = make();
    await u.check();
    u.install();
    await restarted(relaunched);
    expect(git(mine, 'rev-parse', 'HEAD')).toBe(git(theirs, 'rev-parse', 'HEAD'));
    expect(git(mine, 'status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(relaunched).toEqual([true]);
  });
});

describe('what still blocks', () => {
  it('any other edit to package.json, the key beside it or not', async () => {
    leave({ ...PKG, bakedPosthogKey: 'phc_test', scripts: { mine: 'echo' } });
    expect((await make().u.check()).phase).toBe('unsupported');
    leave({ ...PKG, engines: { node: '>=20' } });
    expect((await make().u.check()).phase).toBe('unsupported');
  });

  it('the leftover beside an edit to another tracked file', async () => {
    commit(theirs, 'b.txt', 'b\n', 'b upstream');
    push();
    git(mine, 'pull', '-q', '--ff-only');
    commit(theirs, 'c.txt', 'c\n', 'Another fix');
    push();
    leave({ ...PKG, bakedPosthogKey: 'phc_test' });
    fs.writeFileSync(path.join(mine, 'b.txt'), 'edited\n');
    expect((await make().u.check()).phase).toBe('unsupported');
  });
});

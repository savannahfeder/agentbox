// A BUILD DOES NOT STOP THE NEXT UPDATE.
//
// Measured on the team app folder, 2026-10-02: `git status` showed two files
// changed, shared/claude-commands.generated.mjs and
// shared/claude-models.generated.mjs, both only a version and date stamp. The
// updater's own restart runs `npm run build`, and the build rewrites those two
// files from the Claude Code on this Mac. So after one update the folder read
// as "changes of your own", and every later check said it could not update
// itself. Agents were then left to move the folder by hand, which Claude Code's
// safety check refuses as a deploy, and the folder fell behind public main.
//
// A file the build writes is not somebody's edit. It does not block an update,
// and it is put back before the fast-forward so the merge can never trip on it.
// Any other edit still blocks, as before.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSourceUpdater } from '../main/source-updater.mjs';

const git = (cwd, ...args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' },
}).trim();

let tmp;
let origin;
let mine;
let theirs;

function commit(cwd, file, text, message) {
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', message);
}

function fakeNpm({ failBuild = false } = {}) {
  const calls = [];
  const npm = async (args) => {
    calls.push(args.join(' '));
    if (failBuild && args[0] === 'run') return { code: 1, out: '> agentbox-app build\nerror during build: vite: build failed\n    at stack line' };
    return { code: 0, out: '' };
  };
  return { npm, calls };
}

function make(over = {}) {
  const relaunched = [];
  const u = createSourceUpdater({
    appDir: mine,
    log: { info() {}, warn() {}, error() {} },
    relaunch: () => relaunched.push(true),
    ...over,
  });
  return { u, relaunched };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'source-updater-'));
  origin = path.join(tmp, 'origin.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
  const seed = path.join(tmp, 'seed');
  git(tmp, 'clone', '-q', origin, seed);
  git(seed, 'checkout', '-q', '-b', 'main');
  commit(seed, 'package-lock.json', '{"v":1}\n', 'First');
  git(seed, 'push', '-q', 'origin', 'main');
  mine = path.join(tmp, 'mine');
  theirs = path.join(tmp, 'theirs');
  git(tmp, 'clone', '-q', origin, mine);
  git(tmp, 'clone', '-q', origin, theirs);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});


const GEN = path.join('shared', 'claude-models.generated.mjs');
function seedGenerated() {
  fs.mkdirSync(path.join(theirs, 'shared'), { recursive: true });
  commit(theirs, GEN, 'export const READ_AT = "2026-10-01";\n', 'Generated');
  git(theirs, 'push', '-q', 'origin', 'main');
  git(mine, 'pull', '-q', '--ff-only');
}

describe('a file the build writes', () => {
  it('does not stop an update being offered', async () => {
    seedGenerated();
    commit(theirs, 'a.txt', 'a\n', 'New');
    git(theirs, 'push', '-q', 'origin', 'main');
    fs.writeFileSync(path.join(mine, GEN), 'export const READ_AT = "2026-10-02";\n');
    const { u } = make({ npm: fakeNpm().npm });
    expect((await u.check()).phase).toBe('ready');
  });

  it('is put back and the update goes through, even when the new code changes that file too', async () => {
    seedGenerated();
    commit(theirs, GEN, 'export const READ_AT = "2026-10-03";\n', 'Newer stamp upstream');
    git(theirs, 'push', '-q', 'origin', 'main');
    fs.writeFileSync(path.join(mine, GEN), 'export const READ_AT = "2026-10-02";\n');
    const { u, relaunched } = make({ npm: fakeNpm().npm });
    await u.check();
    u.install();
    // Waits for the restart rather than a fixed time: real git, on a busy Mac.
    for (let i = 0; i < 100 && !relaunched.length; i += 1) await new Promise((r) => setTimeout(r, 100));
    expect(git(mine, 'rev-parse', 'HEAD')).toBe(git(theirs, 'rev-parse', 'HEAD'));
    expect(relaunched).toEqual([true]);
  });

  it('still lets a real edit block the update', async () => {
    seedGenerated();
    commit(theirs, 'a.txt', 'a\n', 'New');
    git(theirs, 'push', '-q', 'origin', 'main');
    fs.writeFileSync(path.join(mine, GEN), 'export const READ_AT = "2026-10-02";\n');
    fs.writeFileSync(path.join(mine, 'package-lock.json'), '{"edited":true}\n');
    const { u } = make({ npm: fakeNpm().npm });
    expect((await u.check()).phase).toBe('unsupported');
  });

  it('is only a file named .generated. in shared/, not any file with that word in it', async () => {
    commit(theirs, 'notes.generated.txt', 'x\n', 'A file of hers');
    git(theirs, 'push', '-q', 'origin', 'main');
    git(mine, 'pull', '-q', '--ff-only');
    commit(theirs, 'a.txt', 'a\n', 'New');
    git(theirs, 'push', '-q', 'origin', 'main');
    fs.writeFileSync(path.join(mine, 'notes.generated.txt'), 'edited\n');
    const { u } = make({ npm: fakeNpm().npm });
    expect((await u.check()).phase).toBe('unsupported');
  });
});

// A TASK FOLDER IS PUT AWAY EVEN WHEN GIT DOES NOT KNOW WHO YOU ARE.
//
// FOUND 2026-10-15 going through how people's git setups differ. Parking a
// closed task's folder commits what was left uncommitted, and a commit needs a
// name and an email. The app's own first commit already gave itself one when
// git had none; the park commits did not.
//
// MEASURED with the real git 2.39.5, HOME pointed at an empty folder and no
// global or system config, so nothing anywhere names the person. On a Mac with
// default settings git makes an identity up from the account and the host name
// and the park goes through. With `user.useConfigOnly=true`, which people set
// precisely so git never makes one up, and on any Linux whose host name has no
// domain, it does not:
//
//   park {"parked":false,"reason":"refused","detail":"Author identity unknown
//   *** Please tell me who you are. ... fatal: no email was given and
//   auto-detection is disabled"}
//
// and the folder stays on the disk, refused again on every sweep, never
// reclaimed.
//
// AND WHAT MUST NOT CHANGE: a person who has told git who they are is who the
// commit is by. The app's name only fills in what is missing.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureTaskFolder, parkTaskFolder, restoreTaskFolder } from '../main/task-folders.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const IDENTITY = ['HOME', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL'];

let saved;
let home;
let dir;

// NOBODY ON THIS MACHINE, for the whole file: no global config, no system
// config, an empty home, and none of the variables git would read a name from.
beforeAll(() => {
  saved = Object.fromEntries(IDENTITY.map((k) => [k, process.env[k]]));
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nobody-home-')));
  for (const k of IDENTITY) delete process.env[k];
  Object.assign(process.env, { HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' });
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  fs.rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nameless-repo-')));
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'app.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, '-c', 'user.name=Somebody', '-c', 'user.email=somebody@example.com', 'commit', '-q', '-m', 'first');
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const author = (ref) => git(dir, 'log', '-1', '--format=%an <%ae>', ref);

function parkSomeWork(id) {
  const made = ensureTaskFolder(dir, id, { dependencies: false });
  fs.writeFileSync(path.join(made.path, 'work.txt'), 'half done\n');
  return { made, parked: parkTaskFolder(dir, id) };
}

describe('parking a task folder when git has no name for anybody', () => {
  it('parks when git is told never to make a name up, and the work comes back', () => {
    git(dir, 'config', 'user.useConfigOnly', 'true');

    const { made, parked } = parkSomeWork('w-nobody');

    expect(parked).toMatchObject({ parked: true, kept: 'work in progress' });
    expect(fs.existsSync(made.path)).toBe(false);
    expect(author('agentbox/w-nobody')).toBe('Agentbox <agentbox@localhost>');
    const back = restoreTaskFolder(dir, 'w-nobody');
    expect(fs.readFileSync(path.join(back.path, 'work.txt'), 'utf8')).toBe('half done\n');
  }, 30_000);

  it('parks when git has a name but no email, keeping the name it has', () => {
    git(dir, 'config', 'user.useConfigOnly', 'true');
    git(dir, 'config', 'user.name', 'Half Known');

    const { parked } = parkSomeWork('w-half');

    expect(parked).toMatchObject({ parked: true });
    expect(author('agentbox/w-half')).toBe('Half Known <agentbox@localhost>');
  }, 30_000);

  it('a person git knows is who the park commit is by', () => {
    git(dir, 'config', 'user.useConfigOnly', 'true');
    git(dir, 'config', 'user.name', 'Known Person');
    git(dir, 'config', 'user.email', 'known@example.com');

    const { parked } = parkSomeWork('w-known');

    expect(parked).toMatchObject({ parked: true });
    expect(author('agentbox/w-known')).toBe('Known Person <known@example.com>');
  }, 30_000);
});

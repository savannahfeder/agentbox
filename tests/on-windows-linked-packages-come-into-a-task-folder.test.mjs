// ON WINDOWS, LINKED PACKAGES COME INTO A TASK FOLDER.
//
// pnpm, and npm workspaces, link packages inside node_modules. On Windows those
// links are junctions, and a junction's target is always a full path: into the
// checkout itself (`C:\repo\node_modules\.pnpm\...`, `C:\repo\packages\app`).
// The copy made each one again pointing at the checkout, and the link check
// refuses any full-path link, so every task in such a project was refused its
// folder with "it is a link to somewhere outside this folder". Found reading
// #51 against the link check; reproduced below with full-path links standing in
// for junctions, which Linux makes as ordinary links.
//
// A full-path link into the checkout is now made pointing at the same place in
// the folder the task will have once it is moved into place, and judged there.
// A link out of the repository is still refused, and a Mac and Linux are as
// they were.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { carryLocalFiles } from '../main/worktree-include.mts';

let dir, root, staging, landsAt;
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, stdio: 'pipe' });
const write = (abs, text = 'x') => { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); };
const junction = (target, at) => { fs.mkdirSync(path.dirname(at), { recursive: true }); fs.symlinkSync(target, at, 'junction'); };

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'linked-packages-')));
  root = path.join(dir, 'repo');
  write(path.join(root, '.gitignore'), 'node_modules\n.cache\n');
  write(path.join(root, 'packages', 'app', 'index.js'), 'tracked');
  git(dir, 'init', '-q', root);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'a');
  staging = path.join(root, '.claude', 'worktrees', '.w-1-staging');
  landsAt = path.join(root, '.claude', 'worktrees', 'w-1');
  git(root, 'worktree', 'add', '-q', '-b', 'w-1', staging);
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const moveIntoPlace = () => git(root, 'worktree', 'move', staging, landsAt);

describe('on Windows, a full-path link into the checkout', () => {
  it('to a package inside node_modules, as pnpm makes, comes in pointing at the task folder', () => {
    write(path.join(root, 'node_modules', '.pnpm', 'left-pad@1', 'node_modules', 'left-pad', 'index.js'), 'pad');
    junction(path.join(root, 'node_modules', '.pnpm', 'left-pad@1', 'node_modules', 'left-pad'), path.join(root, 'node_modules', 'left-pad'));

    expect(carryLocalFiles(root, staging, { landsAt, platform: 'win32' }).carried).toEqual(['node_modules']);
    moveIntoPlace();

    const link = path.join(landsAt, 'node_modules', 'left-pad');
    expect(fs.readlinkSync(link)).toBe(path.join(landsAt, 'node_modules', '.pnpm', 'left-pad@1', 'node_modules', 'left-pad'));
    expect(fs.readFileSync(path.join(link, 'index.js'), 'utf8')).toBe('pad');
  });

  it('to a tracked workspace package, as npm workspaces make, comes in pointing at the task folder', () => {
    write(path.join(root, 'node_modules', 'left-pad', 'index.js'));
    junction(path.join(root, 'packages', 'app'), path.join(root, 'node_modules', '@me', 'app'));

    carryLocalFiles(root, staging, { landsAt, platform: 'win32' });
    moveIntoPlace();

    expect(fs.readlinkSync(path.join(landsAt, 'node_modules', '@me', 'app'))).toBe(path.join(landsAt, 'packages', 'app'));
  });

  it('to something in the checkout that was not carried is still refused', () => {
    write(path.join(root, '.cache', 'thing', 'a.js'));
    write(path.join(root, 'node_modules', 'left-pad', 'index.js'));
    junction(path.join(root, '.cache', 'thing'), path.join(root, 'node_modules', 'thing'));

    expect(() => carryLocalFiles(root, staging, { landsAt, platform: 'win32' }))
      .toThrow(/node_modules[\\/]thing: it points at something that was not carried in with it/);
  });
});

describe('a full-path link out of the repository', () => {
  it('is still refused on Windows', () => {
    write(path.join(dir, 'elsewhere', 'index.js'));
    write(path.join(root, 'node_modules', 'left-pad', 'index.js'));
    junction(path.join(dir, 'elsewhere'), path.join(root, 'node_modules', 'shared'));

    expect(() => carryLocalFiles(root, staging, { landsAt, platform: 'win32' }))
      .toThrow(/node_modules[\\/]shared: it is a link to somewhere outside this folder/);
  });
});

// The copy itself runs the machine's own `cp`, so this case is about the machine it runs on.
describe('on a Mac or Linux', () => {
  it.skipIf(process.platform === 'win32')('a full-path link into the checkout is refused as before', () => {
    write(path.join(root, 'node_modules', '.pnpm', 'left-pad@1', 'index.js'));
    fs.symlinkSync(path.join(root, 'node_modules', '.pnpm', 'left-pad@1'), path.join(root, 'node_modules', 'left-pad'));

    expect(() => carryLocalFiles(root, staging, { landsAt }))
      .toThrow(/node_modules[\\/]left-pad: it is a link to somewhere outside this folder/);
  });
});

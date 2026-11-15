// ON WINDOWS A SECOND ACCOUNT GETS ITS SKILLS THROUGH A JUNCTION.
//
// Measured on Windows 11 with Node 24 and Developer Mode off. The links a
// second Claude account gets from the first login were made with
// fs.symlinkSync(from, to, 'dir'), which threw EPERM. The catch reported each
// name as the person's own, so the account ran with no skills, commands or
// agents and nothing said why. The same call with 'junction' worked without
// Developer Mode. lstat read the junction as a link, realpath followed it to
// the first login, and rmSync on the account folder took the junction away and
// left every file behind it in place.
//
// So the links are junctions. Node ignores the type outside Windows, where the
// link is the same symlink it always was.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linkAccountTooling, SHARED_DIRS } from '../main/account-tooling.mts';

let root;
let home;
let account;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'junction-accounts-'));
  home = path.join(root, 'home');
  account = path.join(home, '.claude-2');
  fs.mkdirSync(account, { recursive: true });
  for (const name of SHARED_DIRS) {
    fs.mkdirSync(path.join(home, '.claude', name), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', name, `hers-${name}.md`), `# ${name}\n`);
  }
});
afterEach(() => {
  // Every link here points inside root, and rmSync removes a link rather than
  // walking into it, which the last test below checks.
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the link is a junction', () => {
  it('asks for a junction for each folder', () => {
    const made = [];
    const out = linkAccountTooling(account, { home, symlink: (from, to, type) => made.push({ from, to, type }) });
    expect(out.linked).toEqual(SHARED_DIRS);
    // The link is made in the account folder's real path, and a Mac's temp
    // folder is under /var, which is itself a link to /private/var.
    const real = fs.realpathSync(account);
    expect(made).toEqual(SHARED_DIRS.map((name) => ({
      from: path.join(home, '.claude', name), to: path.join(real, name), type: 'junction',
    })));
  });

  it('still reports a link that could not be made as left alone', () => {
    const out = linkAccountTooling(account, { home, symlink: () => { throw Object.assign(new Error('refused'), { code: 'EPERM' }); } });
    expect(out.linked).toEqual([]);
    expect(out.theirs).toEqual(SHARED_DIRS);
  });
});

describe('on this disk, whatever it runs on', () => {
  it('makes links that reach the first login', () => {
    const out = linkAccountTooling(account, { home });
    expect(out.linked).toEqual(SHARED_DIRS);
    for (const name of SHARED_DIRS) {
      expect(fs.lstatSync(path.join(account, name)).isSymbolicLink()).toBe(true);
      expect(fs.readdirSync(path.join(account, name))).toEqual([`hers-${name}.md`]);
    }
  });

  it('reads its own links back as already there', () => {
    linkAccountTooling(account, { home });
    const again = linkAccountTooling(account, { home });
    expect(again.linked).toEqual([]);
    expect(again.already).toEqual(SHARED_DIRS);
  });

  it('does not take a real folder of the same name for one of its links', () => {
    fs.mkdirSync(path.join(account, 'skills'));
    const out = linkAccountTooling(account, { home });
    expect(out.theirs).toEqual(['skills']);
    expect(fs.lstatSync(path.join(account, 'skills')).isSymbolicLink()).toBe(false);
  });

  it('removing the account folder leaves the first login whole', () => {
    linkAccountTooling(account, { home });
    fs.rmSync(account, { recursive: true, force: true });
    expect(fs.existsSync(account)).toBe(false);
    for (const name of SHARED_DIRS) {
      expect(fs.readdirSync(path.join(home, '.claude', name))).toEqual([`hers-${name}.md`]);
    }
  });
});

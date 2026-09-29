// A NEW PROJECT GETS ITS CODE FOLDER.
//
// Until this was built, `createProduct` wrote a name and a date and nothing
// else. `repoPath` was always null, and `repoPath` is what becomes a worker's
// cwd, so every agent that landed in a brand new project landed with nothing to
// open. That is the hole these tests hold shut.
//
// The other half is that the folder stays OPTIONAL. With no folder chosen yet,
// the project is made without one, exactly as before.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';

// The same shape every other Store test uses: a throwaway root, and the app's
// own work-item code underneath it.

async function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-newproject-'));
  const accountRoot = path.join(root, 'accounts', 'test-account');
  fs.mkdirSync(accountRoot, { recursive: true });
  return new Store({
    storeRoot: root,
    accountId: 'test-account',
    accountRoot,
    products: [],
  }).init();
}

const readProject = (s, slug) =>
  JSON.parse(fs.readFileSync(path.join(s.config.accountRoot, slug, 'project.json'), 'utf8'));

describe('the folder the card proposed actually gets made', () => {
  it('makes a folder that does not exist yet, and records it', async () => {
    const s = await store();
    const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-dev-')), 'homebase');
    expect(fs.existsSync(repo)).toBe(false);

    const { slug } = s.createProduct({ name: 'Homebase', repoPath: repo });

    expect(fs.statSync(repo).isDirectory()).toBe(true);
    expect(readProject(s, slug).repoPath).toBe(repo);
    // And the app reads it back, which is the only reason writing it matters:
    // this field is a worker's cwd.
    expect(s.listProducts().find((p) => p.slug === slug).repoPath).toBe(repo);
  });

  it('accepts a folder that already exists and leaves what is in it alone', async () => {
    const s = await store();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-existing-'));
    fs.writeFileSync(path.join(repo, 'README.md'), 'someone else was here');

    s.createProduct({ name: 'House', repoPath: repo });

    expect(fs.readFileSync(path.join(repo, 'README.md'), 'utf8')).toBe('someone else was here');
    expect(readProject(s, 'house').repoPath).toBe(repo);
  });

  it('expands the ~ the card writes, because only this side knows whose home it is', async () => {
    const s = await store();
    const under = `zero-tilde-${process.pid}`;
    const full = path.join(os.homedir(), under);
    try {
      s.createProduct({ name: 'Tilde', repoPath: `~/${under}` });
      expect(fs.statSync(full).isDirectory()).toBe(true);
      expect(readProject(s, 'tilde').repoPath).toBe(full);
    } finally {
      fs.rmSync(full, { recursive: true, force: true });
    }
  });
});

describe('the folder stays optional', () => {
  it('makes the project with no folder at all when the words were cleared', async () => {
    const s = await store();
    s.createProduct({ name: 'Nothing Yet', repoPath: null });
    const p = readProject(s, 'nothing-yet');
    expect(p.repoPath).toBeUndefined();
    expect(s.listProducts().find((x) => x.slug === 'nothing-yet').repoPath).toBe(null);
  });

  it('treats an empty or blank path as no folder, never as the current directory', async () => {
    const s = await store();
    s.createProduct({ name: 'Blank', repoPath: '   ' });
    expect(readProject(s, 'blank').repoPath).toBeUndefined();
  });

  it('is unchanged for a call that names no folder', async () => {
    const s = await store();
    const { slug } = s.createProduct({ name: 'Old Way' });
    expect(readProject(s, slug).repoPath).toBeUndefined();
    // And it files nothing, since. The opening row this used to assert is
    // gone; a-new-project-files-no-row.test.mjs holds that ground.
    expect(s.listItems().filter((i) => i.product === slug)).toEqual([]);
  });
});

describe('nothing is half-made when the folder cannot be', () => {
  it('leaves no project behind if the code folder is refused', async () => {
    const s = await store();
    // A file, not a directory: mkdir under it cannot succeed.
    const blocker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-block-')), 'afile');
    fs.writeFileSync(blocker, 'x');

    expect(() => s.createProduct({ name: 'Doomed', repoPath: path.join(blocker, 'inside') })).toThrow();
    expect(fs.existsSync(path.join(s.config.accountRoot, 'doomed'))).toBe(false);
    expect(s.listProducts().map((p) => p.slug)).not.toContain('doomed');
  });
});

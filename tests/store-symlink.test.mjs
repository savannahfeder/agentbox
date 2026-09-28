// A product that is a SYMLINK into another store root (the combined-workspace
// pattern: one physical dir reachable from two roots) must list exactly like a
// real directory. Pinned because a Dirent reports a symlink as
// not-a-directory, and the resulting skip made a symlinked product silently
// invisible to the inbox and the supervisor: Cascade vanished the night the
// workspaces were combined (2026-08-04).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mjs';

function makeRoots() {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-otherstore-'));
  const account = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-account-'));
  const real = path.join(other, 'cascade');
  fs.mkdirSync(real);
  fs.writeFileSync(path.join(real, 'project.json'), JSON.stringify({ id: 'cascade', name: 'Cascade' }));
  fs.symlinkSync(real, path.join(account, 'cascade'));
  return { account };
}

describe('listProducts over a combined store', () => {
  it('sees a product that is a symlink to a directory in another root', () => {
    const { account } = makeRoots();
    const store = new Store({ accountRoot: account, products: [] });
    const slugs = store.listProducts().map((p) => p.slug);
    expect(slugs).toContain('cascade');
  });

  it('still skips broken symlinks and plain files', () => {
    const { account } = makeRoots();
    fs.symlinkSync(path.join(account, 'no-such-target'), path.join(account, 'dangling'));
    fs.writeFileSync(path.join(account, 'stray.txt'), 'not a product');
    const store = new Store({ accountRoot: account, products: [] });
    const slugs = store.listProducts().map((p) => p.slug);
    expect(slugs).toEqual(['cascade']);
  });
});

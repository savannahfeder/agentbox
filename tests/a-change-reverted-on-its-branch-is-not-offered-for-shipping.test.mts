// A thread was sent "Discard the change" and its agent threw the work away by
// committing a revert on the task branch, not by resetting it. It came back to
// Needs you saying "The isZero change has been discarded", and under that the
// app still offered "1 Ship it (recommended)" (QA session 47, w-da79e0f9e8).
// `git log` on the branch held "Add isZero export" then its revert, with no net
// difference from main. The folder's "committed" was a count of commits ahead
// of main, so an add-and-revert pair read as work waiting to ship.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { whereTheWorkStands } from '../main/git-change.mts';
import { shipOfferFor } from '../renderer/src/ship-offer.ts';
import { Name } from '../shared/product-name.mjs';

const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });

describe('a branch whose commits add up to nothing', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zero-revert-')));
    run(dir, 'init', '-q', '-b', 'main', '.');
    run(dir, 'config', 'user.email', 'agent@agentbox.local');
    run(dir, 'config', 'user.name', Name);
    fs.writeFileSync(path.join(dir, 'index.js'), 'module.exports = {};\n');
    run(dir, 'add', '-A');
    run(dir, 'commit', '-qm', 'init');
    run(dir, 'checkout', '-q', '-b', 'agentbox/w-da79e0f9e8');
    fs.writeFileSync(path.join(dir, 'index.js'), 'function isZero(n) {\n  return n === 0;\n}\n\nmodule.exports = { isZero };\n');
    run(dir, 'commit', '-qam', 'Add isZero export');
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('says nothing is committed once the work is reverted on the branch', () => {
    run(dir, 'revert', '--no-edit', 'HEAD');
    expect(whereTheWorkStands(dir)).toEqual({ committed: false, uncommitted: false });
    expect(shipOfferFor(whereTheWorkStands(dir))).toBeNull();
  });

  it('still says committed while the work is on the branch', () => {
    expect(whereTheWorkStands(dir)).toEqual({ committed: true, uncommitted: false });
  });

  it('still says committed when only part of the work was reverted', () => {
    fs.writeFileSync(path.join(dir, 'README.md'), '# isZero\n');
    run(dir, 'add', 'README.md');
    run(dir, 'commit', '-qm', 'A file that stays');
    run(dir, 'revert', '--no-edit', 'HEAD~1');
    expect(whereTheWorkStands(dir)).toEqual({ committed: true, uncommitted: false });
  });

  it('still says committed while the revert is loose', () => {
    run(dir, 'revert', '--no-commit', 'HEAD');
    expect(whereTheWorkStands(dir)).toEqual({ committed: true, uncommitted: true });
  });
});

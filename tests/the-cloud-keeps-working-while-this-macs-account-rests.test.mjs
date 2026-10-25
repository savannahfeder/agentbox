// THE CLOUD KEEPS WORKING WHILE THIS MAC'S CLAUDE ACCOUNT RESTS.
//
// What broke (2026-10-16): the cloud set to Everything, and threads sat idle.
// A cloud slot was only offered while this Mac had a Claude account free
// (`_capacityFor` counts the Mac's logins that are not cooling down), and the
// fleet-wide brake for "no healthy Claude account" stopped cloud starts as
// well. Both describe this Mac's logins, and the cloud runs on accounts of its
// own (main/cloud/logins.mjs). Measured that day off the app's saved state:
// both Mac accounts were benched until midnight, which left the cloud's two
// accounts with nothing to run.
//
// Now a resting Mac account, or the brake, stops starts on this Mac only. The
// cloud still runs what may go there, while it has an account that may run.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

const product = { slug: 'p', dir: '', repoPath: '/r' };
const make = ({ cloud = true } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-rest-'));
  dirs.push(root);
  product.dir = root;
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [product], isDue: () => true },
    root,
  );
  sup._cloudReady = () => cloud;
  return sup;
};
const item = { id: 'w-a', product: 'p' };
const rest = (sup) => { sup._profileCooldown = { default: Date.now() + 3_600_000 }; };

describe('with this Mac\'s only Claude account resting', () => {
  it('the cloud still has room, and the row goes there', () => {
    const sup = make();
    rest(sup);
    expect(sup._localSlotFor('claude')).toBe(false);
    expect(sup._cloudSlotFor('claude')).toBe(true);
    expect(sup._hasSlotFor('claude', item)).toBe(true);
    expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-a', engine: 'claude' })).toBe('cloud');
  });

  it('but not a row that may not go to the cloud', () => {
    const sup = make();
    rest(sup);
    sup.threadOnMac['w-a'] = true;
    expect(sup._hasSlotFor('claude', item)).toBe(false);
  });

  it('and nothing at all when the cloud cannot run', () => {
    const sup = make({ cloud: false });
    rest(sup);
    expect(sup._hasSlotFor('claude', item)).toBe(false);
  });
});

describe('with the brake on for this Mac', () => {
  it('nothing starts here, and the cloud still runs', () => {
    const sup = make();
    sup._spawnCooldownUntil = Date.now() + 600_000;
    expect(sup._localSlotFor('claude')).toBe(false);
    expect(sup._hasSlotFor('claude', item)).toBe(true);
    expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-a', engine: 'claude' })).toBe('cloud');
  });

  it('and without a cloud, nothing starts', () => {
    const sup = make({ cloud: false });
    sup._spawnCooldownUntil = Date.now() + 600_000;
    expect(sup._hasSlotFor('claude', item)).toBe(false);
  });
});

describe('with this Mac healthy', () => {
  it('both have room, as before', () => {
    const sup = make();
    expect(sup._localSlotFor('claude')).toBe(true);
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });
});

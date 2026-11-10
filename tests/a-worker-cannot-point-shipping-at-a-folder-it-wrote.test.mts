// A WORKER CANNOT POINT SHIPPING AT A FOLDER IT WROTE.
//
// The ship queue runs the project's ship script as the app, outside every
// worker check and with the saved GitHub push token. It found that script
// through the project's repoPath, which lives in the store a worker can write
// (update_product, or the project file itself). The 2026-11-10 security audit
// pointed repoPath at a worker-written folder and the app ran that folder's
// scripts/ship.mjs with the token in its environment. Shipping is now pinned
// to the checkout it was turned on for, recorded in the app's own ship.json.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHIP_LABEL, ShipQueue, pinShipBases, readShipSettings, shipScriptFor } from '../main/ship-queue.mts';

let tmp: string; let repo: string; let worker: string; let userDir: string; let folders: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ship-pin-')));
  repo = path.join(tmp, 'repo');
  worker = path.join(tmp, 'store', 'team', 'notes-assets');
  userDir = path.join(tmp, 'user');
  folders = path.join(tmp, 'folders');
  for (const dir of [repo, worker]) {
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'ship.mjs'), '');
  }
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(path.join(folders, 'w-a'), { recursive: true });
  fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify({ team: { script: 'scripts/ship.mjs' } }));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const folderFor = (item: { id: string }) => path.join(folders, item.id);
const row = (id: string) => ({ id, product: 'team', status: 'blocked', labels: [SHIP_LABEL], updatedAt: 1000 });
const fakeStore = () => {
  const calls: unknown[][] = [];
  return { calls, shipped: (...a: unknown[]) => calls.push(['shipped', ...a]), shipFailed: (...a: unknown[]) => calls.push(['shipFailed', ...a]) };
};

describe('the checkout shipping was turned on for', () => {
  it('is recorded the first time the queue reads the setting', () => {
    pinShipBases(userDir, [{ slug: 'team', repoPath: repo }]);
    expect(readShipSettings(userDir)).toEqual({ team: { script: 'scripts/ship.mjs', base: repo } });
  });

  it('is kept once recorded, whatever repoPath says later', () => {
    pinShipBases(userDir, [{ slug: 'team', repoPath: repo }]);
    pinShipBases(userDir, [{ slug: 'team', repoPath: worker }]);
    expect(readShipSettings(userDir).team).toEqual({ script: 'scripts/ship.mjs', base: repo });
  });

  it('is never a task folder', () => {
    const inTask = path.join(repo, '.claude', 'worktrees', 'w-a');
    fs.mkdirSync(inTask, { recursive: true });
    pinShipBases(userDir, [{ slug: 'team', repoPath: inTask }]);
    expect(readShipSettings(userDir).team).toEqual({ script: 'scripts/ship.mjs' });
  });
});

describe('a project whose repoPath no longer matches', () => {
  it('names no script, so nothing from the other folder runs', () => {
    const settings = { team: { script: 'scripts/ship.mjs', base: repo } };
    expect(shipScriptFor({ slug: 'team', repoPath: repo }, settings)).toBe(path.join(repo, 'scripts', 'ship.mjs'));
    expect(shipScriptFor({ slug: 'team', repoPath: worker }, settings)).toBeNull();
  });

  it('is refused on the thread, out loud, and the worker\'s script never runs', async () => {
    const store = fakeStore();
    const ran: string[] = [];
    const q = new ShipQueue({ store, userDir, folderFor, isLive: () => false, run: async (script) => { ran.push(script); return { code: 0, out: 'ship: shipped abc1234.\n' }; } });
    await q.tick([], [{ slug: 'team', repoPath: repo }]);
    await q.tick([row('w-a')], [{ slug: 'team', repoPath: worker }]);
    expect(ran).toEqual([]);
    const [kind, slug, id, { note, labels }] = store.calls[0] as [string, string, string, { note: string; labels: string[] }];
    expect([kind, slug, id, labels]).toEqual(['shipFailed', 'team', 'w-a', []]);
    expect(note).toMatch(/^It did not ship/);
    expect(note).toContain(repo);
    // Refused once for that marking, not on every tick.
    await q.tick([row('w-a')], [{ slug: 'team', repoPath: worker }]);
    expect(store.calls).toHaveLength(1);
  });

  it('still ships from the recorded checkout', async () => {
    const store = fakeStore();
    const ran: string[] = [];
    const q = new ShipQueue({ store, userDir, folderFor, isLive: () => false, run: async (script) => { ran.push(script); return { code: 0, out: 'ship: shipped abc1234.\n' }; } });
    await q.tick([row('w-a')], [{ slug: 'team', repoPath: repo }]);
    expect(ran).toEqual([path.join(repo, 'scripts', 'ship.mjs')]);
    expect(store.calls[0][0]).toBe('shipped');
  });
});

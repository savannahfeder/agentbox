// A THREAD THIS MAC CANNOT HOLD GOES TO THE CLOUD, AND "EVERYTHING" SENDS
// EVERY THREAD THERE FIRST.
//
// Two things broke the "cloud when full" promise once main's memory gate
// (main/start-hold.mjs) landed beside cloud runs (docs/cloud/PLAN.md):
//   - a Mac with a free slot but no memory held the row, so it waited even
//     though a cloud slot was free: the gate is about this Mac's memory and
//     must never hold a cloud run;
//   - there was no way to say "I'm signing off, run everything there": the
//     founder asked for it on 2026-10-13 ("I'm just going to sign off. I want
//     everything to continue working") and chose it for her own trial.
// Measured against the supervisor with the spawn left out, the same way
// tests/a-thread-runs-in-the-cloud-only-when-this-mac-is-full does.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Supervisor } from '../main/supervisor.mjs';
import { taskFolderPath } from '../main/task-folders.mjs';

let tmp; let repo; let folder; let product; let sup;
const savedConfigEnv = process.env.AGENTBOX_CLOUD_CONFIG;

const build = ({ cloudRuns = null, slots = 2, maxCloudSessions = 10, personal = [], memory = true } = {}) => {
  sup = new Supervisor(
    { home: '/nonexistent-home', storeRoot: path.join(tmp, 'store'), maxConcurrentSessions: slots, authProfiles: ['default'], cloudRuns, maxCloudSessions, personalProducts: personal },
    { listItems: () => [], listProducts: () => [product], isDue: () => true, settleAnswer() {}, readItem: () => null },
    path.join(tmp, 'app'),
  );
  sup._bringCloudHome = () => {};
  sup._hasCloudSignIn = () => true;
  sup._memoryLetsStart = () => memory;
  return sup;
};
const fill = (n, { cloud = false } = {}) => {
  for (let i = 0; i < n; i += 1) {
    const id = `w-busy-${cloud ? 'c' : 'l'}-${sup.sessions.size}`;
    sup.sessions.set(id, { itemId: id, product: 'p', engine: 'claude', cloud, child: { kill() {} }, tail: [] });
  }
};
const row = (id = 'w-1') => ({ id, product: 'p', status: 'open', labels: ['founder'] });

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudroom-')));
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: repo });
  product = { slug: 'p', repoPath: repo, dir: path.join(tmp, 'store', 'p') };
  folder = taskFolderPath(repo, 'w-1');
  const cfg = path.join(tmp, 'cloud.json');
  fs.writeFileSync(cfg, JSON.stringify({ region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x' }));
  process.env.AGENTBOX_CLOUD_CONFIG = cfg;
});
afterEach(() => {
  if (savedConfigEnv === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = savedConfigEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('a thread this Mac\'s memory holds back', () => {
  it('goes to the cloud when a cloud slot is free, though this Mac has a slot', () => {
    build({ memory: false });
    expect(sup._localSlotFor('claude')).toBe(true);
    expect(sup._roomFor('claude', row())).toBe(true);
    expect(sup._heldForMemory.has('w-1')).toBe(true);
    // The spawn reads that as a full Mac.
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude', localFull: true })).toBe('cloud');
  });

  it('waits when cloud runs are off, exactly as the memory gate alone would', () => {
    build({ memory: false, cloudRuns: false });
    expect(sup._roomFor('claude', row())).toBe(false);
  });

  it('waits when the row cannot run in the cloud (a personal project)', () => {
    build({ memory: false, personal: ['p'] });
    expect(sup._roomFor('claude', row())).toBe(false);
  });

  it('runs here, and forgets the cloud, once memory allows it', () => {
    build({ memory: false });
    sup._roomFor('claude', row());
    sup._memoryLetsStart = () => true;
    expect(sup._roomFor('claude', row())).toBe(true);
    expect(sup._heldForMemory.has('w-1')).toBe(false);
  });

  // The brake is about this Mac's Claude logins. The cloud runs on accounts
  // of its own, so it takes the row (2026-10-16,
  // tests/the-cloud-keeps-working-while-this-macs-account-rests).
  it('stays put while a run of Claude failures has braked Claude here, and goes to the cloud', () => {
    build({ memory: false, cloudRuns: false });
    sup._spawnCooldownUntil = Date.now() + 60_000;
    expect(sup._roomFor('claude', row())).toBe(false);
    build({ memory: false });
    sup._spawnCooldownUntil = Date.now() + 60_000;
    expect(sup._roomFor('claude', row())).toBe(true);
    build({ cloudRuns: 'all' });
    sup._spawnCooldownUntil = Date.now() + 60_000;
    expect(sup._localSlotFor('claude')).toBe(false);
    expect(sup._roomFor('claude', row())).toBe(true);
  });

  it('never asks the memory gate when this Mac has no slot at all', () => {
    build({ memory: false });
    fill(2);
    let asked = 0;
    sup._memoryLetsStart = () => { asked += 1; return false; };
    expect(sup._roomFor('claude', row())).toBe(true);
    expect(asked).toBe(0);
  });
});

describe('the spawn, after its folder is made (Codex\'s review)', () => {
  it('runs a held row here after all when memory recovered meanwhile', () => {
    build({ memory: false });
    sup._roomFor('claude', row());
    sup._memoryLetsStart = () => true;
    expect(sup._stillHeldForMemory(row())).toBe(false);
    expect(sup._heldForMemory.has('w-1')).toBe(false);
  });

  it('keeps it held when memory is still short', () => {
    build({ memory: false });
    sup._roomFor('claude', row());
    expect(sup._stillHeldForMemory(row())).toBe(true);
  });

  it('falls back from the cloud to this Mac only as a start here would', () => {
    build({ memory: true });
    expect(sup._mayRunHereInstead({ item: row(), engine: 'claude' })).toBe(true);
    // Memory short: not here, the row waits.
    sup._memoryLetsStart = () => false;
    expect(sup._mayRunHereInstead({ item: row(), engine: 'claude' })).toBe(false);
    // Held for memory at the spawn: not here either.
    sup._memoryLetsStart = () => true;
    expect(sup._mayRunHereInstead({ item: row(), engine: 'claude', heldForMemory: true })).toBe(false);
    // No slot here, or a pinned account that is full: waits.
    expect(sup._mayRunHereInstead({ item: row(), engine: 'claude', pinnedFull: true })).toBe(false);
    fill(2);
    expect(sup._mayRunHereInstead({ item: row(), engine: 'claude' })).toBe(false);
    // A reply runs here whatever.
    expect(sup._mayRunHereInstead({ item: row(), engine: 'claude', continuation: true })).toBe(true);
  });

  it('does not wind the memory gate\'s clock for a cloud start', () => {
    build();
    expect(sup._startsOnThisMac({ cloud: false })).toBe(true);
    expect(sup._startsOnThisMac({ cloud: true })).toBe(false);
    expect(sup._startsOnThisMac({ command: 'ls', cloud: false })).toBe(false);
  });
});

describe('"Everything" (cloudRuns: "all")', () => {
  it('sends a row to the cloud first, though this Mac has a free slot', () => {
    build({ cloudRuns: 'all' });
    expect(sup._localSlotFor('claude')).toBe(true);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('cloud');
  });

  it('runs here when the cloud is at its cap and this Mac has room', () => {
    build({ cloudRuns: 'all', maxCloudSessions: 1 });
    fill(1, { cloud: true });
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('local');
  });

  it('keeps a row that cannot go to the cloud on this Mac', () => {
    build({ cloudRuns: 'all', personal: ['p'] });
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('local');
  });

  it('finds room in the cloud without asking this Mac\'s memory', () => {
    build({ cloudRuns: 'all' });
    let asked = 0;
    sup._memoryLetsStart = () => { asked += 1; return false; };
    expect(sup._roomFor('claude', row())).toBe(true);
    expect(asked).toBe(0);
  });

  it('is still off when cloud runs are off, and "when full" is unchanged', () => {
    build({ cloudRuns: false });
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('local');
    build({ cloudRuns: null });
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('local');
  });
});

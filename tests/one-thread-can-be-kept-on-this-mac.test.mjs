// ONE THREAD CAN BE KEPT ON THIS MAC, WHATEVER THE CLOUD IS SET TO.
//
// What she asked (2026-10-15): "for this thread, I would like a way to take it
// off the cloud but I don't see an easy path for that for one specific
// thread." Measured that day by reading the code: where a thread runs was the
// cloud setting's alone, for every thread at once, and a thread already in the
// cloud stayed there until its run ended. She picked the drawing on
// 2026-10-16: a row in the thread's own ⋯ menu, shown only on a thread the
// cloud is running or could run.
//
// Now the row moves a thread in the cloud to this Mac (its run there stops,
// its work comes home, and it carries on here), keeps a thread that is here
// off the cloud, and lets the cloud have it again. The choice is this Mac's,
// kept across restarts, beside the pins.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { threadMenuRows, PLACE_ROW } from '../renderer/src/threads/ThreadMenu.tsx';
import { Supervisor } from '../main/supervisor.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const product = { slug: 'p', repoPath: '/r' };
const store = { listItems: () => [], listProducts: () => [product], isDue: () => true };
const make = (root) => new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zero-onmac-'));

describe('the row in the thread\'s menu', () => {
  it('comes first, and says what it will do in each of the three states', () => {
    const rows = (place) => threadMenuRows({ change: false, terminal: 'closed', finish: true, place });
    expect(rows('cloud')[0]).toEqual({ id: 'place', ...PLACE_ROW.cloud, key: null });
    expect(rows('here')[0]).toEqual({ id: 'place', ...PLACE_ROW.here, key: null });
    expect(rows('kept')[0]).toEqual({ id: 'place', ...PLACE_ROW.kept, key: null });
    // Each names what it does, and where the thread is now.
    expect(new Set(Object.values(PLACE_ROW).map((r) => r.label + r.detail)).size).toBe(3);
    expect(PLACE_ROW.cloud.detail).toMatch(/cloud/i);
    expect(PLACE_ROW.kept.detail).toMatch(/Mac/);
    // Her words, 2026-10-16: "Run on the cloud", beside "Run on this Mac".
    expect(PLACE_ROW.kept.label).toBe('Run on the cloud');
    expect(PLACE_ROW.cloud.label).toBe('Run on this Mac');
  });

  it('is not there where the cloud could never run the thread', () => {
    expect(threadMenuRows({ change: false, terminal: 'closed', finish: true, place: null }).map((r) => r.id)).toEqual(['terminal', 'done']);
  });
});

describe('a thread kept on this Mac', () => {
  it('is never one the cloud may take, and is remembered across a restart', () => {
    const root = tmp();
    const sup = make(root);
    expect(sup._cloudEligible({ id: 'w-a', product: 'p' })).toBe(true);
    sup.setThreadOnMac({ 'w-a': true });
    expect(sup._cloudEligible({ id: 'w-a', product: 'p' })).toBe(false);
    expect(sup._mayRunInCloud({ id: 'w-a' }, product, '/r/.claude/worktrees/w-a')).toBe(false);
    expect(make(root)._cloudEligible({ id: 'w-a', product: 'p' })).toBe(false);
    expect(sup.withPlaces([{ id: 'w-a' }, { id: 'w-b' }])).toEqual([{ id: 'w-a', onMac: true }, { id: 'w-b' }]);
  });

  it('can be let go to the cloud again', () => {
    const sup = make(tmp());
    sup.setThreadOnMac({ 'w-a': true });
    sup.setThreadOnMac({ 'w-a': null });
    expect(sup._cloudEligible({ id: 'w-a', product: 'p' })).toBe(true);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a' }]);
  });

  it('stops its run in the cloud, so its work comes home and it carries on here', () => {
    const sup = make(tmp());
    const signals = [];
    sup.sessions.set('w-a', { itemId: 'w-a', product: 'p', cloud: true, child: { kill: (s) => signals.push(s ?? 'SIGTERM') } });
    sup.sessions.set('w-b', { itemId: 'w-b', product: 'p', cloud: false, child: { kill: (s) => signals.push(`b:${s}`) } });
    sup._recoverPending = false;
    sup.setThreadOnMac({ 'w-a': true, 'w-b': true });
    // Only the one in the cloud is stopped, the way Stop stops it, and the
    // sweep that resumes stranded sessions is armed to bring it back here.
    expect(signals).toEqual(['SIGTERM']);
    expect(sup._recoverPending).toBe(true);
  });
});

describe('the plumbing', () => {
  it('reaches the supervisor from the menu', () => {
    expect(read('shared/bridge-map.mjs')).toMatch(/setThreadOnMac: 'zero:set-thread-on-mac'/);
    expect(read('main/ipc.mjs')).toMatch(/ipcMain\.handle\('zero:set-thread-on-mac'[\s\S]{0,120}supervisor\.setThreadOnMac\(/);
    expect(read('preload.cjs')).toMatch(/setThreadOnMac: \(payload\) => ipcRenderer\.invoke\('zero:set-thread-on-mac', payload\)/);
    expect(read('renderer/src/api.ts')).toMatch(/async setThreadOnMac\(/);
    expect(read('renderer/src/App.tsx')).toMatch(/onPlace=\{/);
  });
});

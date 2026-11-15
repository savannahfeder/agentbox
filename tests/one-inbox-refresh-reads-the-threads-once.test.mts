// ONE INBOX REFRESH READS THE THREADS ONCE.
//
// What broke: the window's refresh (`zero:snapshot`) listed every thread on
// disk itself, then `supervisor.status()` listed them all again, then
// `cloudStatus()` did a third time while a run was on the Mac. Each list stats
// every project and copies every thread. The Mac's freeze log
// (memory-log/freeze-<day>.jsonl) for 2026-11-07 and 08 put `listItems` in
// about 260 s of freezes, 105 s from the refresh's own read, 98 s from
// `status()` and 47 s from `cloudStatus()`, and the refresh ran up to 25 times
// a minute at about a second each when memory was tight.
//
// Now the refresh hands its list to both, and each still reads for itself when
// nobody hands it one.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';

let tmp;
let envBefore;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'one-read-')));
  envBefore = process.env.AGENTBOX_CLOUD_CONFIG;
  delete process.env.AGENTBOX_CLOUD_CONFIG;
});
afterEach(() => {
  if (envBefore === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = envBefore;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const thread = (id, extra = {}) => ({ id, product: 'p', status: 'open', title: id, labels: [], ...extra });

function supervisor(threads) {
  const store = { reads: 0, listItems() { this.reads += 1; return threads; }, listProducts: () => [{ slug: 'p', dir: tmp }], isDue: () => true };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], cloudRuns: 'full' }, store, tmp);
  sup._saveState = () => {};
  return { sup, store };
}

function withACloudAndARun(sup) {
  fs.mkdirSync(path.join(tmp, '.agentbox'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.agentbox', 'cloud.json'), JSON.stringify({ gateway: 'https://cloud.invalid' }));
  sup.sessions.set('w-aaaaaa', { itemId: 'w-aaaaaa', engine: 'claude', profile: 'default' });
  sup._cloudUsable = () => true;
  sup._movableToCloud = () => true;
}

describe('one inbox refresh', () => {
  it('status() works from the list it is handed and reads none of its own', () => {
    const threads = [thread('w-aaaaaa'), thread('w-bbbbbb', { answer: 'go on' })];
    const { sup, store } = supervisor(threads);
    const handed = sup.status(threads);
    expect(store.reads).toBe(0);
    store.reads = 0;
    expect(sup.status()).toEqual(handed);
    expect(store.reads).toBe(1);
  });

  it('cloudStatus() works from the list it is handed and reads none of its own', () => {
    const threads = [thread('w-aaaaaa')];
    const { sup, store } = supervisor(threads);
    withACloudAndARun(sup);
    const handed = sup.cloudStatus(threads);
    expect(handed.movable).toEqual(['w-aaaaaa']);
    expect(store.reads).toBe(0);
    expect(sup.cloudStatus().movable).toEqual(['w-aaaaaa']);
    expect(store.reads).toBe(1);
  });

  it('cloudStatus() reads nothing at all when no run could move, handed a list or not', () => {
    const { sup, store } = supervisor([thread('w-aaaaaa')]);
    expect(sup.cloudStatus().movable).toEqual([]);
    expect(store.reads).toBe(0);
  });

  it('the refresh hands its one list to both', () => {
    const ipc = fs.readFileSync(new URL('../main/ipc.mts', import.meta.url), 'utf8');
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:snapshot'"));
    const body = handler.slice(0, handler.indexOf('\n  });'));
    expect(body.match(/store\.listItems\(/g)).toHaveLength(1);
    expect(body).toMatch(/supervisor\.status\(items\)/);
    expect(body).toMatch(/supervisor\.cloudStatus\(items\)/);
  });
});

// THE CLOUD BUTTON COUNTS THE CLOUD RUNS A RESTART PICKED BACK UP.
//
// What broke (2026-10-24): the cloud button beside New thread said 5 while
// In progress showed eleven threads working in the cloud. The button and the
// cloud's cap both counted the app's own sessions only. A cloud run the app
// restarted under (every ship restarts it) carries on and is followed home
// outside that list, so its row showed it working in the cloud and the button
// left it out, and the cap thought those slots were free. Measured here on a
// real Supervisor before the fix: one cloud run started here and one picked
// back up, the button said 1 and a cap of 2 still had room.
//
// The Groups card had the same gap and was fixed on 2026-10-23
// (your-groups-card-counts-the-cloud-runs-a-restart-picked-back-up).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';

let tmp; let store; let sup; let joined; let folder; let relays; let homeWas;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-count-')));
  homeWas = process.env.AGENTBOX_HOME;
  process.env.AGENTBOX_HOME = path.join(tmp, 'home');
  fs.mkdirSync(process.env.AGENTBOX_HOME, { recursive: true });
  const root = path.join(tmp, 'store');
  const repo = path.join(tmp, 'repo');
  folder = path.join(repo, '.claude', 'worktrees', 'w-1');
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  const storeMcp = path.join(tmp, 'store-mcp.sh');
  fs.writeFileSync(storeMcp, '#!/bin/sh\n');
  sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, maxCloudSessions: 2, storeMcpCommand: storeMcp }, store, tmp);
  sup.writeMcpConfig = () => null;
  sup._workerEnv = () => ({});
  relays = [];
  sup._spawnCloudRelay = () => {
    const c = new EventEmitter();
    c.stdout = new PassThrough();
    c.stderr = new PassThrough();
    c.kill = () => true;
    relays.push(c);
    return c;
  };
  joined = store.fileItem('team', { title: 'Release check', kind: 'task', body: 'Check it.' });
  sup._liveSessions[joined.id] = { sessionId: 's-1', product: 'team', cwd: folder, profile: null, engine: 'claude', continuation: true, startedAt: Date.now() - 60_000, cloud: true };
});

afterEach(() => {
  sup?.stop?.();
  if (homeWas === undefined) delete process.env.AGENTBOX_HOME; else process.env.AGENTBOX_HOME = homeWas;
  fs.rmSync(tmp, { recursive: true, force: true });
});

const tick = () => new Promise((r) => setImmediate(r));
const says = (text) => `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } })}\n`;
const running = (title, extra = {}) => {
  const item = store.fileItem('team', { title, kind: 'task', body: '.' });
  sup.sessions.set(item.id, { itemId: item.id, product: 'team', startedAt: Date.now(), cloudSentAt: Date.now(), engine: 'claude', tail: [], ...extra });
  return item;
};
const pickedBackUp = async () => {
  sup._bringCloudHome(folder);
  relays.at(-1).stdout.write(says('Checking the release.'));
  await tick();
};
const button = () => sup.cloudStatus().running;
const shownInTheCloud = () => sup.status().running.filter((r) => r.where === 'cloud').length;

describe('the number on the cloud button', () => {
  it('counts a cloud run the app picked back up after a restart', async () => {
    running('Tray filters', { cloud: true });
    await pickedBackUp();
    expect(button()).toBe(2);
  });

  it('is the number of threads In progress shows working in the cloud', async () => {
    running('Phone alerts');
    running('Tray filters', { cloud: true });
    await pickedBackUp();
    expect(button()).toBe(shownInTheCloud());
  });

  it('counts a thread once when a new run on it starts beside the one being picked back up', async () => {
    await pickedBackUp();
    sup.sessions.set(joined.id, { itemId: joined.id, product: 'team', startedAt: Date.now(), cloudSentAt: Date.now(), engine: 'claude', tail: [], cloud: true });
    expect(button()).toBe(1);
  });

  it('leaves out runs on this computer', () => {
    running('Phone alerts');
    expect(button()).toBe(0);
  });

  it('drops a picked-back-up run once it ends', async () => {
    await pickedBackUp();
    expect(button()).toBe(1);
    relays.at(-1).emit('exit', 0, null);
    await tick();
    expect(button()).toBe(0);
  });
});

describe('the cloud cap', () => {
  it('counts a picked-back-up run as a slot taken', async () => {
    running('Tray filters', { cloud: true });
    await pickedBackUp();
    expect(sup._whyWaitingForCloud('claude')).toEqual({ why: 'cloud-full', detail: 2 });
  });

  it('still has room below the cap', async () => {
    await pickedBackUp();
    expect(sup._whyWaitingForCloud('claude').why).not.toBe('cloud-full');
  });
});

// YOUR GROUPS CARD COUNTS THE CLOUD RUNS A RESTART PICKED BACK UP.
//
// What broke (2026-10-23): Groups said "You · 1 agent" while In progress
// showed nine threads working, eight of them in the cloud. The card counted
// the app's own sessions and nothing else. A cloud run the app restarted
// under (every ship restarts it) carries on and is followed home outside that
// list, so In progress showed it working and Groups did not. Measured here on
// a real Supervisor before the fix: with one run on this computer and one
// cloud run picked back up, the window listed two and the card counted one.
//
// The card now reads the same list of runs as In progress.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';
import { roomsSetup } from '../main/team/room-setup.mjs';
import { myPresence } from '../shared/room-cards.mjs';

let tmp; let store; let sup; let rooms; let joined; let folder; let relays; let homeWas;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'groups-count-')));
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
  sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, storeMcpCommand: storeMcp }, store, tmp);
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
  // The cloud run a restart cut the app off from.
  joined = store.fileItem('team', { title: 'Release check', kind: 'task', body: 'Check it.' });
  sup._liveSessions[joined.id] = { sessionId: 's-1', product: 'team', cwd: folder, profile: null, engine: 'claude', continuation: true, startedAt: Date.now() - 60_000, cloud: true };
  rooms = roomsSetup({ config: { storeRoot: root, alphaRooms: true }, store, supervisor: sup, userDir: path.join(tmp, 'user'), log: () => {} });
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
  sup.sessions.set(item.id, { itemId: item.id, product: 'team', startedAt: Date.now(), engine: 'claude', tail: [], ...extra });
  return item;
};
const pickedBackUp = async () => {
  sup._bringCloudHome(folder);
  relays.at(-1).stdout.write(says('Checking the release.'));
  await tick();
};
const counted = () => rooms.presenceFacts().running.map((r) => r.itemId).sort();
const shown = () => sup.status().running.map((r) => r.itemId).sort();

describe('the agents your Groups card counts', () => {
  it('include a cloud run the app picked back up after a restart', async () => {
    const here = running('Phone alerts');
    await pickedBackUp();
    expect(counted()).toEqual([here.id, joined.id].sort());
    expect(myPresence(rooms.presenceFacts()).agents_running).toBe(2);
  });

  it('are the runs In progress shows working, one for one', async () => {
    running('Phone alerts');
    running('Tray filters', { cloud: true });
    await pickedBackUp();
    expect(shown()).toHaveLength(3);
    expect(counted()).toEqual(shown());
  });

  it('count a thread once when a new run on it starts beside the one being picked back up', async () => {
    await pickedBackUp();
    sup.sessions.set(joined.id, { itemId: joined.id, product: 'team', startedAt: Date.now(), engine: 'claude', tail: [], cloud: true });
    expect(counted()).toEqual([joined.id]);
  });

  it('leave out a run being picked back up that has said nothing yet, as In progress does', () => {
    sup._bringCloudHome(folder);
    expect(shown()).toEqual([]);
    expect(counted()).toEqual([]);
  });

  it('leave out a thread held open only for Remote Control', () => {
    running('Held for my phone', { remoteIdle: true });
    expect(counted()).toEqual([]);
  });

  it('drop a picked-back-up run once it ends', async () => {
    await pickedBackUp();
    expect(counted()).toEqual([joined.id]);
    relays.at(-1).emit('exit', 0, null);
    await tick();
    expect(counted()).toEqual([]);
  });
});

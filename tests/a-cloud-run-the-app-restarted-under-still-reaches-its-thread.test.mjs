// A CLOUD RUN THE APP RESTARTED UNDER STILL REACHES ITS THREAD.
//
// What broke (2026-10-20, the multiplayer design thread): an update restarted
// the app at 11:46 while the thread's run was in the cloud. The run was left
// going, as it should be, and joined again when the app opened, but the
// process that joined it read nothing of what it said. For the next fourteen
// minutes the thread read "Nothing running" while the run worked, its steps
// stopped at 11:45:46, and the answer it wrote at 11:51 ("Should I go with my
// picks...") never reached the row: the ledger has no result between 10:56 and
// the next run's at 12:11. She typed "continue" at 11:59 into a thread that
// looked stuck, and the next run read it as a yes to picks she never saw.
//
// The joined run's stream now comes to the app (main/cloud/run.mjs), and the
// supervisor follows it for the thread whose record names that folder: the
// thread shows it running in the cloud, its steps go into the thread's record,
// its last message goes onto the row as any run's does, and Stop stops it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Supervisor } from '../main/supervisor.mjs';
import { Store } from '../main/store.mjs';
import { machineryPath } from '../main/store/home.mjs';

let tmp; let store; let sup; let row; let folder; let relays;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-thread-')));
  const root = path.join(tmp, 'store');
  const repo = path.join(tmp, 'repo');
  folder = path.join(repo, '.claude', 'worktrees', 'w-1');
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  row = store.fileItem('team', { title: 'Multiplayer', kind: 'task', body: 'Draw it.' });
  // A cloud run always has the store's tools, so the app reads it as such.
  const storeMcp = path.join(tmp, 'store-mcp.sh');
  fs.writeFileSync(storeMcp, '#!/bin/sh\n');
  sup = new Supervisor({ storeRoot: root, home: tmp, maxConcurrentSessions: 3, storeMcpCommand: storeMcp }, store, tmp);
  sup.writeMcpConfig = () => null;
  sup._workerEnv = () => ({});
  relays = [];
  sup._spawnCloudRelay = (args, opts) => {
    const c = new EventEmitter();
    c.stdout = new PassThrough();
    c.stderr = new PassThrough();
    c.signals = [];
    c.kill = (sig) => { c.signals.push(sig ?? 'SIGTERM'); return true; };
    c.opts = opts;
    relays.push(c);
    return c;
  };
  // What the run the quit cut off left behind: its session, in the cloud.
  sup._liveSessions[row.id] = { sessionId: 's-1', product: 'team', cwd: folder, profile: null, engine: 'claude', continuation: true, startedAt: Date.now() - 60_000, cloud: true };
});

afterEach(() => {
  sup?.stop?.();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const line = (o) => `${JSON.stringify(o)}\n`;
const says = (text) => line({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const result = (text, extra = {}) => line({ type: 'result', subtype: 'success', is_error: false, result: text, ...extra });
const running = () => sup.status().running.filter((r) => r.itemId === row.id);
const traces = () => {
  const dir = machineryPath(store.productDir('team'), path.join('sessions', row.id));
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.log')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')) : [];
};
const tick = () => new Promise((r) => setImmediate(r));

describe('a run the app left going when it restarted', () => {
  it('shows on its thread as running in the cloud while it works, and not before it speaks', async () => {
    sup._bringCloudHome(folder);
    expect(running()).toEqual([]);
    relays[0].stdout.write(says('All pages are checked. Writing the overview page.'));
    await tick();
    expect(running()).toEqual([expect.objectContaining({ itemId: row.id, product: 'team', where: 'cloud' })]);
    relays[0].stdout.write(result('Should I go with my picks?'));
    relays[0].emit('exit', 0, null);
    await tick();
    expect(running()).toEqual([]);
  });

  it('writes its steps into the thread\'s record', async () => {
    sup._bringCloudHome(folder);
    relays[0].stdout.write(says('All pages are checked. Writing the overview page.'));
    relays[0].stdout.write(result('Should I go with my picks?'));
    relays[0].emit('exit', 0, null);
    await tick();
    const [log] = traces();
    expect(log).toMatch(/^\d\d:\d\d:\d\d {2}All pages are checked\. Writing the overview page\.$/m);
    expect(log).toMatch(/== RESULT/);
    expect(log).toMatch(/^# exited \(0\)/m);
  });

  it('puts its last message on the row and forgets the session it no longer needs to resume', async () => {
    sup._bringCloudHome(folder);
    relays[0].stdout.write(says('Writing the overview page.'));
    relays[0].stdout.write(result('**Should I go with my picks?**'));
    relays[0].emit('exit', 0, null);
    await tick();
    expect(store.readItem('team', row.id).result).toBe('**Should I go with my picks?**');
    expect(sup._liveSessions[row.id]).toBeUndefined();
  });

  it('takes its last word when it spoke twice, as Claude Code does after a job it left ends', async () => {
    sup._bringCloudHome(folder);
    relays[0].stdout.write(result('first say'));
    relays[0].stdout.write(says('again'));
    relays[0].stdout.write(result('Should I go with my picks?'));
    relays[0].emit('exit', 0, null);
    await tick();
    expect(store.readItem('team', row.id).result).toBe('Should I go with my picks?');
  });

  it('writes nothing, and keeps the session, when its work did not come home', async () => {
    sup._bringCloudHome(folder);
    relays[0].stdout.write(result('Should I go with my picks?'));
    relays[0].emit('exit', 75, null);
    await tick();
    expect(store.readItem('team', row.id).result ?? null).toBe(null);
    expect(sup._liveSessions[row.id]).toBeDefined();
  });

  it('writes nothing when its last result was an error', async () => {
    sup._bringCloudHome(folder);
    relays[0].stdout.write(result('usage limit reached', { is_error: true }));
    relays[0].emit('exit', 0, null);
    await tick();
    expect(store.readItem('team', row.id).result ?? null).toBe(null);
    expect(sup._liveSessions[row.id]).toBeDefined();
  });

  it('does not write over an answer the agent put on the row itself during the run', async () => {
    store.modules.workItemsDisk.updateWorkItem(store.productDir('team'), row.id, { result: 'its own words' }, { source: 'agent' });
    sup._bringCloudHome(folder);
    relays[0].stdout.write(result('Done.'));
    relays[0].emit('exit', 0, null);
    await tick();
    expect(store.readItem('team', row.id).result).toBe('its own words');
  });

  // The reply it was carrying is answered; one typed while the app showed
  // nothing running is not, and goes to the next run.
  it('settles the reply it heard, and not one she typed while it was away', async () => {
    store.answerItem('team', row.id, { answer: 'names as Maya C.', status: 'open' });
    sup._noteHeard(store.readItem('team', row.id), 's-1');
    sup._bringCloudHome(folder);
    relays[0].stdout.write(result('Should I go with my picks?'));
    relays[0].emit('exit', 0, null);
    await tick();
    const heard = store.readItem('team', row.id);
    expect(sup._answerDelivered(heard)).toBe(true);
    expect(heard.answeredThrough).toBe(heard.wrote.answer.ts);
  });

  it('leaves a reply it never heard for the next run', async () => {
    store.answerItem('team', row.id, { answer: 'names as Maya C.', status: 'open' });
    sup._noteHeard(store.readItem('team', row.id), 's-1');
    await new Promise((r) => setTimeout(r, 5));
    store.answerItem('team', row.id, { answer: 'continue', status: 'open' });
    sup._bringCloudHome(folder);
    relays[0].stdout.write(result('Should I go with my picks?'));
    relays[0].emit('exit', 0, null);
    await tick();
    const after = store.readItem('team', row.id);
    expect(after.answer).toBe('continue');
    expect(sup._answerDelivered(after)).toBe(false);
    expect(after.answeredThrough ?? 0).toBeLessThan(after.wrote.answer.ts);
  });

  it('is stopped by Stop on its thread', async () => {
    sup._bringCloudHome(folder);
    relays[0].stdout.write(says('working'));
    await tick();
    expect(sup.stopSession(row.id)).toBe(true);
    expect(relays[0].signals).toEqual(['SIGINT']);
  });
});

// A RUN THAT ENDED WHILE THE APP WAS SHUT (w-4465054f04). Its marker is gone
// once its work is laid in, a moment before its process has passed on its
// answer and ended. In the cloud power test a fresh run of the same request
// started 2 s after the marker went, and the answer the first run wrote was
// never shown.
describe('a thread whose run is still being brought home', () => {
  const where = () => sup._whereToRun({ item: store.readItem('team', row.id), product: store.listProducts().find((p) => p.slug === 'team'), cwd: folder, engine: 'claude' });

  it('does not start again until that process has ended', () => {
    sup._bringCloudHome(folder);
    expect(where()).toBe(null);
    relays[0].emit('exit', 0, null);
    expect(where()).not.toBe(null);
  });

  it('starts as usual when nothing is being brought home', () => {
    expect(where()).not.toBe(null);
  });

  it('gets the answer that run passes on before anything starts again', async () => {
    sup._bringCloudHome(folder);
    relays[0].stdout.write(result('Health check test added; it fails with 503 when the database is down.'));
    await tick();
    expect(where()).toBe(null);
    relays[0].emit('exit', 0, null);
    await tick();
    expect(store.readItem('team', row.id).result).toBe('Health check test added; it fails with 503 when the database is down.');
  });
});

describe('bringing home a folder no thread is waiting on', () => {
  it('reads its output so it never blocks, and shows nothing and writes nothing', async () => {
    delete sup._liveSessions[row.id];
    sup._bringCloudHome(folder);
    expect(relays[0].opts.stdio[1]).toBe('pipe');
    relays[0].stdout.write(says('working'));
    relays[0].stdout.write(result('Done.'));
    expect(relays[0].stdout.readableFlowing).toBe(true);
    relays[0].emit('exit', 0, null);
    await tick();
    expect(running()).toEqual([]);
    expect(traces()).toEqual([]);
    expect(store.readItem('team', row.id).result ?? null).toBe(null);
    expect(sup.stopSession(row.id)).toBe(false);
  });

  it('makes no record for a run that had already ended and says nothing', async () => {
    sup._bringCloudHome(folder);
    relays[0].emit('exit', 0, null);
    await tick();
    expect(traces()).toEqual([]);
    expect(store.readItem('team', row.id).result ?? null).toBe(null);
  });
});

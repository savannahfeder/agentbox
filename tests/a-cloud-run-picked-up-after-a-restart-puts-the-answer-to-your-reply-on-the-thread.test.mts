// A CLOUD RUN PICKED UP AFTER A RESTART PUTS THE ANSWER TO YOUR REPLY ON THE THREAD.
//
// What broke (w-34f79ab66e, 2026-11-23): a cloud run answered, its answer went
// on the row, and the run waited for the next reply. The reply went straight
// in and the agent worked on it for two hours. The app restarted on the Mac
// meanwhile and picked the run back up. When the run ended, the row still had
// the answer from before the reply, and the reply was marked answered, so
// nothing ever ran on it again.
//
// The app skips the closing message when the agent wrote its own answer during
// the run, and it judged "during the run" from the run's first start. The
// answer of the turn before the reply was newer than that, so it read as the
// agent's own words for this turn. The record kept for a restart had no turn
// start, so the run picked back up could not tell.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Supervisor } from '../main/supervisor.mts';
import { Store } from '../main/store.mts';

let tmp; let store; let sup; let row; let folder; let relays;

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-turn-')));
  const root = path.join(tmp, 'store');
  const repo = path.join(tmp, 'repo');
  folder = path.join(repo, '.claude', 'worktrees', 'w-1');
  fs.mkdirSync(folder, { recursive: true });
  fs.mkdirSync(path.join(root, 'team'), { recursive: true });
  fs.writeFileSync(path.join(root, 'team', 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'team', name: 'Team', repoPath: repo }));
  store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [], accountId: 'nobody', claudeBin: '/nonexistent' }).init();
  row = store.fileItem('team', { title: 'Paint the shed', kind: 'task', body: 'Build it.' });
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
    c.kill = () => true;
    c.opts = opts;
    relays.push(c);
    return c;
  };
});

afterEach(() => {
  sup?.stop?.();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const line = (o) => `${JSON.stringify(o)}\n`;
const result = (text) => line({ type: 'result', subtype: 'success', is_error: false, result: text });
const tick = () => new Promise((r) => setImmediate(r));
const pause = () => new Promise((r) => setTimeout(r, 5));

// The first turn's answer, as `_turnOver` writes it, then her reply, steered
// into the waiting run and heard there.
async function firstTurnThenReply({ recordTurn = false } = {}) {
  sup._liveSessions[row.id] = { sessionId: 's-1', product: 'team', cwd: folder, profile: null, engine: 'claude', continuation: false, startedAt: Date.now() - 60_000, cloud: true };
  store.recordSessionResult('team', row.id, { result: '**Paint it blue?**', status: null });
  await pause();
  store.answerItem('team', row.id, { answer: 'Green instead.', status: 'open' });
  sup._noteHeard(store.readItem('team', row.id), 's-1');
  if (recordTurn) sup._liveSessions[row.id].turnStartedAt = Date.now();
  await pause();
}

async function endsWith(text) {
  sup._bringCloudHome(folder);
  relays[0].stdout.write(result(text));
  relays[0].emit('exit', 0, null);
  await tick();
  return store.readItem('team', row.id);
}

describe('a cloud run that took your reply between turns and was picked up after a restart', () => {
  it('puts its answer to your reply on the thread, over the answer from before it', async () => {
    await firstTurnThenReply();
    const after = await endsWith('**Painted it green.**');
    expect(after.result).toBe('**Painted it green.**');
    expect(after.answeredThrough).toBe(after.wrote.answer.ts);
  });

  it('does the same when the record for the restart kept the turn\'s start', async () => {
    await firstTurnThenReply({ recordTurn: true });
    const after = await endsWith('**Painted it green.**');
    expect(after.result).toBe('**Painted it green.**');
  });

  it('still keeps an answer the agent wrote on the row itself after your reply', async () => {
    await firstTurnThenReply({ recordTurn: true });
    store.modules.workItemsDisk.updateWorkItem(store.productDir('team'), row.id, { result: 'its own words' }, { source: 'agent' });
    const after = await endsWith('Done.');
    expect(after.result).toBe('its own words');
  });
});

describe('a reply that goes into a cloud run waiting between turns', () => {
  it('leaves the turn\'s start in the record a restart reads', () => {
    sup._liveSessions[row.id] = { sessionId: 's-1', product: 'team', cwd: folder, profile: null, engine: 'claude', startedAt: Date.now() - 60_000, cloud: true };
    const session = { itemId: row.id, product: 'team', between: true, startedAt: Date.now() - 60_000, result: 'first', child: {} };
    const before = Date.now();
    sup._nextTurn(session);
    expect(sup._liveSessions[row.id].turnStartedAt).toBeGreaterThanOrEqual(before);
    expect(sup._liveSessions[row.id].turnStartedAt).toBe(session.turnStartedAt);
  });

  it('touches no other thread\'s record', () => {
    sup._liveSessions['w-other'] = { sessionId: 's-2', product: 'team', cwd: folder, startedAt: 1, cloud: true };
    sup._nextTurn({ itemId: row.id, product: 'team', between: true, startedAt: 1, child: {} });
    expect(sup._liveSessions['w-other'].turnStartedAt).toBeUndefined();
    expect(sup._liveSessions[row.id]).toBeUndefined();
  });
});

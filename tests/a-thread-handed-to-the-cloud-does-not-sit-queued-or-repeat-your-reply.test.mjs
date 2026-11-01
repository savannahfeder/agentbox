// A THREAD HANDED TO THE CLOUD DOES NOT SIT QUEUED, AND DOES NOT REPEAT YOUR REPLY.
//
// Measured 2026-10-31 on a real store. With the Mac awake for over an hour and
// slots free, `carried` in .zero-supervisor.json held 19 threads, and 5 of the 9
// rows reading Queued on the phone were among them. Their replies were 1.2 to
// 1.6 hours old. Two faults:
//
//  - The hold ended only when the phone pass said so, and a pass that keeps
//    coming without saying so kept every row held. A reply typed after the
//    hand-over, which the cloud never saw, waited behind it too.
//  - While asleep the queue skips its "already delivered" test, so a sleeping
//    Mac handed the cloud replies that had already been answered, once per
//    wake. Threads reported "this message has come through seven times" and
//    "eight times now", while nobody had resent anything.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { kitCopyPath } from '../main/cloud/kit.mjs';

const MIN = 60_000;
const DEV = 'a1b2c3d4e5f6';

function makeSupervisor(items) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-carried-'));
  const store = {
    listItems: () => items,
    listProducts: () => [{ slug: 'alpha', name: 'Alpha', dir: '/tmp/nowhere' }],
    isDue: (i, now = Date.now()) => !i?.runAt || i.runAt <= now,
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
  sup.spawned = [];
  sup.spawnWorker = (item, opts) => sup.spawned.push({ item, opts });
  sup.idleMs = () => 30 * MIN;
  sup._engineFor = () => 'claude';
  sup.leavesKitsFor = (slug) => slug === 'alpha';
  fs.mkdirSync(path.join(root, 'cloud-kits'), { recursive: true });
  sup.kit = (id) => fs.writeFileSync(kitCopyPath(root, 'alpha', id), JSON.stringify({ v: 1, engine: 'claude', item: id, project: 'alpha', cwd: '/x', marker: {} }));
  return sup;
}

const row = (id, over = {}) => ({ id, product: 'alpha', title: 'A task', status: 'open', kind: 'directive', labels: ['founder'], priority: 5, createdAt: 1, updatedAt: 1, ...over });
const replied = (id, answer, ts, over = {}) => row(id, { answer, wrote: { answer: { ts, source: 'founder' } }, ...over });
const started = (sup) => sup.spawned.map((s) => s.item.id);

function asleep(sup) {
  sup._lastTickAt = Date.now() - 16 * MIN;
  sup._wokeAt = 0;
}

function handedAgo(sup, id, ms) {
  sup.handedOver({ item: id, command: `c-${id}`, kind: 'reply' });
  sup._carried[id].at = Date.now() - ms;
}

function awakeFor(sup, ms) {
  sup._bootAt = Date.now() - ms;
  sup._wokeAt = 0;
  sup.phoneCarrying({ device: DEV, slugs: ['alpha'] });
}

describe('with the Mac awake and the phone pass still coming', () => {
  it('a thread handed over an hour ago runs here, however often the pass comes', async () => {
    const sup = makeSupervisor([row('w-1')]);
    handedAgo(sup, 'w-1', 60 * MIN);
    awakeFor(sup, 60 * MIN);
    await sup.tick();
    expect(started(sup)).toEqual(['w-1']);
    expect(sup._carried['w-1']).toBeUndefined();
  });

  it('is still held one minute short of ten minutes awake', async () => {
    const sup = makeSupervisor([row('w-1')]);
    handedAgo(sup, 'w-1', 60 * MIN);
    awakeFor(sup, 9 * MIN);
    await sup.tick();
    expect(started(sup)).toEqual([]);
    expect(sup._carried['w-1']).toBeDefined();
  });

  it('runs once ten minutes awake have passed', async () => {
    const sup = makeSupervisor([row('w-1')]);
    handedAgo(sup, 'w-1', 60 * MIN);
    awakeFor(sup, 10 * MIN + 1_000);
    await sup.tick();
    expect(started(sup)).toEqual(['w-1']);
  });

  it('a hand-over made a moment ago is left for the pass to deal with', async () => {
    const sup = makeSupervisor([row('w-1')]);
    handedAgo(sup, 'w-1', 0);
    awakeFor(sup, 60 * MIN);
    await sup.tick();
    expect(started(sup)).toEqual([]);
  });

  it('releasing one thread leaves the others held', async () => {
    const sup = makeSupervisor([row('w-1'), row('w-2')]);
    handedAgo(sup, 'w-1', 60 * MIN);
    handedAgo(sup, 'w-2', 0);
    awakeFor(sup, 60 * MIN);
    await sup.tick();
    expect(started(sup)).toEqual(['w-1']);
    expect(Object.keys(sup._carried)).toEqual(['w-2']);
  });
});

describe('a reply written after the hand-over', () => {
  it('starts straight away, since the cloud never saw it', async () => {
    const handed = Date.now() - 5 * MIN;
    const sup = makeSupervisor([replied('w-1', 'Ship it', handed + MIN)]);
    handedAgo(sup, 'w-1', 5 * MIN);
    awakeFor(sup, 2 * MIN);
    await sup.tick();
    expect(started(sup)).toEqual(['w-1']);
    expect(sup._carried['w-1']).toBeUndefined();
  });

  it('a reply from before the hand-over is the one handed over, and stays held', async () => {
    const handed = Date.now() - 5 * MIN;
    const sup = makeSupervisor([replied('w-1', 'Ship it', handed - MIN)]);
    handedAgo(sup, 'w-1', 5 * MIN);
    awakeFor(sup, 2 * MIN);
    await sup.tick();
    expect(started(sup)).toEqual([]);
  });

  it('with the Mac asleep nothing starts, even for a newer reply', async () => {
    const handed = Date.now() - 5 * MIN;
    const sup = makeSupervisor([replied('w-1', 'Ship it', handed + MIN)]);
    handedAgo(sup, 'w-1', 5 * MIN);
    asleep(sup);
    await sup.tick();
    expect(started(sup)).toEqual([]);
    expect(sup._carried['w-1']).toBeDefined();
  });
});

describe('what a sleeping Mac hands over', () => {
  const ts = 1_000;

  it('a reply nobody has answered yet goes, as before', async () => {
    const item = replied('w-1', 'Ship it', ts);
    const sup = makeSupervisor([item]);
    sup.kit('w-1');
    asleep(sup);
    const list = await sup.carryWhileAsleep();
    expect(list.map((c) => [c.item, c.kind])).toEqual([['w-1', 'reply']]);
  });

  it('a reply already delivered does not go again', async () => {
    const item = replied('w-1', 'Ship it', ts);
    const sup = makeSupervisor([item]);
    sup.kit('w-1');
    sup._handledAnswers.add(sup._answerKey(item));
    asleep(sup);
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('a reply an agent has already settled does not go again', async () => {
    const item = replied('w-1', 'and make hrs "hours"', ts, {
      answeredThrough: ts,
      result: 'Done.',
      wrote: { answer: { ts, source: 'founder' }, result: { ts: ts + 1, source: 'agent' } },
    });
    const sup = makeSupervisor([item]);
    sup.kit('w-1');
    asleep(sup);
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('a thread whose cloud run was just joined does not go again in the same pass', async () => {
    const item = replied('w-1', 'Ship it', ts);
    const sup = makeSupervisor([item]);
    sup.kit('w-1');
    asleep(sup);
    await sup.tick();
    sup._liveSessions['w-1'] = { sessionId: null, product: 'alpha', cwd: '/x', cloud: true, startedAt: Date.now() };
    asleep(sup);
    expect(await sup.carryWhileAsleep()).toEqual([]);
  });

  it('a new reply on a delivered thread does go', async () => {
    const old = replied('w-1', 'Ship it', ts);
    const newer = replied('w-1', 'One more thing', ts + 5);
    const sup = makeSupervisor([newer]);
    sup.kit('w-1');
    sup._handledAnswers.add(sup._answerKey(old));
    asleep(sup);
    expect((await sup.carryWhileAsleep()).map((c) => c.payload.text)).toEqual(['One more thing']);
  });
});

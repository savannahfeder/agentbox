// A REPLY SENT ONCE REACHES THE AGENT ONCE.
//
// What broke (2026-10-30 to 31): one reply, answered twelve minutes later, then
// answered twelve more times. The agents said "this message has come through
// seven times" and the person had sent it once. Read from the thread's ledger
// and the phone pass's record: each repeat was its own cloud command, nothing
// new landed on the row, and a sleeping Mac was handing the cloud replies already
// settled. Across the store that was 153 repeat runs on 16 threads in under a day.
//
// The times below are when that thread's repeats came home. The reply stayed
// settled through all of them (replaying `answerSettled` over its ledger says
// true at each), which is why the check belongs on the hand-over.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { kitCopyPath } from '../main/cloud/kit.mts';
import { foldWorkItems } from '../shared/work-items.mts';

const MIN = 60_000;
const ID = 'w-1';
// Minutes after the reply: 23:06 that night to 15:28 the next afternoon.
const WAKES = [921, 928, 959, 1214, 1381, 1620, 1673, 1730, 1751, 1780, 1827, 1903];

function thread() {
  const t0 = Date.now() - 3 * 24 * 60 * MIN;
  const lines = [{
    id: ID, ts: t0 - 60 * MIN, source: 'founder',
    patch: { title: 'A task', status: 'open', kind: 'directive', priority: 5, labels: ['founder'] },
  }];
  const write = (minutes, source, patch) => lines.push({ id: ID, ts: t0 + minutes * MIN, source, patch });
  const read = () => {
    const row = foldWorkItems(lines).get(ID);
    return row ? { ...row, product: 'alpha' } : null;
  };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'once-'));
  const store = {
    listItems: () => [read()],
    listProducts: () => [{ slug: 'alpha', name: 'Alpha', dir: '/tmp/nowhere' }],
    isDue: () => true,
    readItem: () => read(),
  };
  const sup = new Supervisor({ storeRoot: root, maxConcurrentSessions: 3 }, store, root, root, root);
  sup.spawned = [];
  sup.spawnWorker = (item) => sup.spawned.push(item.id);
  sup.idleMs = () => 30 * MIN;
  sup._engineFor = () => 'claude';
  sup.leavesKitsFor = () => true;
  fs.mkdirSync(path.join(root, 'cloud-kits'), { recursive: true });
  fs.writeFileSync(kitCopyPath(root, 'alpha', ID), JSON.stringify({ v: 1, engine: 'claude', item: ID, project: 'alpha', cwd: '/x', marker: {} }));
  return { sup, write, read, t0 };
}

const answered = ({ write, read }, minutes) => {
  const ts = read().wrote.answer.ts;
  write(minutes, 'agent', { result: 'Done.' });
  write(minutes, 'system', { answeredThrough: ts });
};

// One wake: what it hands over, each run then done and home as the real ones
// were. A run's mark is gone by then, which is what let the next wake go again.
async function wake(t, minutes) {
  t.sup._lastTickAt = Date.now() - 16 * MIN;
  t.sup._wokeAt = 0;
  // A restart or the 500-entry window can lose this memory; the ledger cannot.
  t.sup._handledAnswers.clear();
  const list = await t.sup.carryWhileAsleep();
  for (const c of list) {
    t.sup.handedOver({ item: c.item, command: `c-${minutes}`, kind: c.kind });
    answered(t, minutes);
    t.sup.carriedFinished([`c-${minutes}`]);
  }
  return list;
}

async function replay(t, wakes = WAKES) {
  const sent = [];
  for (const at of wakes) sent.push(...await wake(t, at));
  return sent;
}

describe('the thread that heard one reply thirteen times, replayed', () => {
  it('starts one run for the reply, not thirteen', async () => {
    const t = thread();
    t.write(0, 'founder', { answer: 'They are a tad too big.' });
    t.sup._lastTickAt = Date.now();
    await t.sup.tick();
    expect(t.sup.spawned).toEqual([ID]);
    answered(t, 12);

    expect(await replay(t)).toEqual([]);
    expect(t.sup.spawned).toEqual([ID]);
  });

  it('stays quiet once the thread is blocked on a cloud run kept aside', async () => {
    const t = thread();
    t.write(0, 'founder', { answer: 'They are a tad too big.' });
    answered(t, 12);
    t.write(928, 'system', { status: 'blocked', note: 'Kept aside on its own branch.' });
    expect(await replay(t)).toEqual([]);
  });

  it('stays quiet on an awake pass too', async () => {
    const t = thread();
    t.write(0, 'founder', { answer: 'They are a tad too big.' });
    answered(t, 12);
    t.sup._lastTickAt = Date.now();
    await t.sup.tick();
    expect(t.sup.spawned).toEqual([]);
  });
});

describe('what must still go', () => {
  it('a reply nobody has answered, once, however many wakes follow', async () => {
    const t = thread();
    t.write(0, 'founder', { answer: 'They are a tad too big.' });
    const sent = await replay(t);
    expect(sent.map((c) => c.payload.text)).toEqual(['They are a tad too big.']);
  });

  it('a newer reply on a settled thread, and only that one', async () => {
    const t = thread();
    t.write(0, 'founder', { answer: 'They are a tad too big.' });
    answered(t, 12);
    t.write(2000, 'founder', { answer: 'Line them up as well.' });
    const sent = await replay(t, [2001, 2002, 2003]);
    expect(sent.map((c) => c.payload.text)).toEqual(['Line them up as well.']);
  });

  it('the same words sent again, because that is a second message', async () => {
    const t = thread();
    t.write(0, 'founder', { answer: 'They are a tad too big.' });
    answered(t, 12);
    t.write(2000, 'founder', { answer: 'They are a tad too big.' });
    expect((await replay(t, [2001])).length).toBe(1);
  });

  it('a newer reply on a blocked thread, since a reply is what unblocks it', async () => {
    const t = thread();
    t.write(0, 'founder', { answer: 'They are a tad too big.' });
    answered(t, 12);
    t.write(928, 'system', { status: 'blocked', note: 'Kept aside on its own branch.' });
    t.write(2000, 'founder', { answer: 'Bring the two together.' });
    expect((await replay(t, [2001])).map((c) => c.payload.text)).toEqual(['Bring the two together.']);
  });

  it('a reply whose run wrote nothing on the row, since that run answered nobody', async () => {
    const t = thread();
    t.write(0, 'founder', { answer: 'They are a tad too big.' });
    t.write(12, 'system', { answeredThrough: t.read().wrote.answer.ts });
    expect((await replay(t, [921])).length).toBe(1);
  });
});

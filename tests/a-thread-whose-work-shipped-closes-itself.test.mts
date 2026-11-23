// A THREAD WHOSE WORK SHIPPED CLOSES ITSELF (w-bb45118b10).
//
// The person: "Half my inbox right now is filled with things that have shipped
// and that I just need to mark done." A successful ship wrote a note and never
// a status, so the thread stayed open with an answer newer than their last
// word and sat in Needs you. Measured on their store: 23 threads they wrote were
// open with "Shipped to main" as the app's last word on 2026-11-13, 29 by
// 2026-11-15. Now the ship closes the thread when the agent's last word offers
// nothing but closing it and they have not replied since, and threads already
// shipped that way are closed when the app starts. One they reopened, replied
// to, or still have a real choice on stays.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../main/store.mts';
import { offersOnlyClose, shipClosesIt, closedByItsShip } from '../shared/ship-closes-its-thread.mts';
import { belongsInInbox } from '../renderer/src/list-rules.ts';

const app = (ts: number) => ({ ts, source: 'system' });
const agent = (ts: number) => ({ ts, source: 'agent' });
const her = (ts: number) => ({ ts, source: 'founder' });
const ANSWER = '**Done, and it is marked to ship.**\n\nThe card folds now.\n\n## Options\n1. Close this task';
const row = (over: Record<string, unknown> = {}) => ({
  id: 'w-1', product: 'team', title: 'Fold the card', kind: 'directive', labels: ['founder'], status: 'open',
  result: ANSWER, createdAt: 10, updatedAt: 100,
  ...over,
  wrote: { title: her(10), body: her(10), result: agent(100), ...((over.wrote as object) ?? {}) },
});

describe('what the agent last offered', () => {
  it('closing only, or nothing at all, lets the ship close the thread', () => {
    expect(offersOnlyClose(ANSWER)).toBe(true);
    expect(offersOnlyClose('**Shipped.**\n\n## Options\n1. Looks right, close this task (recommended)')).toBe(true);
    expect(offersOnlyClose('**Done.** The tests pass.')).toBe(true);
  });

  it('any real choice keeps it open', () => {
    expect(offersOnlyClose('**Ship it?**\n\n## Options\n1. Ship it (recommended)\n2. Close this task')).toBe(false);
    expect(offersOnlyClose('**Which one?**\n\n## Options\n1. Build A (recommended)\n2. Build B')).toBe(false);
    expect(offersOnlyClose('Which layout should I keep?\n\n1. The first (recommended)\n2. The second')).toBe(false);
  });

  it('a close with more work after it is a real choice', () => {
    expect(offersOnlyClose('## Options\n1. Close this task, then file the follow-up')).toBe(false);
  });
});

describe('when a ship closes its thread', () => {
  it('closes one whose agent offered only closing', () => {
    expect(shipClosesIt(row())).toBe(true);
  });

  it('never one where you replied after the agent\'s last word', () => {
    expect(shipClosesIt(row({ answer: 'one more thing', wrote: { answer: her(150) } }))).toBe(false);
  });

  it('does close one you answered before that last word', () => {
    expect(shipClosesIt(row({ answer: 'ship it', wrote: { answer: her(50) } }))).toBe(true);
  });

  it('never one still offering a choice', () => {
    expect(shipClosesIt(row({ result: '## Options\n1. Ship it\n2. Change the copy first' }))).toBe(false);
  });

  it('never one an agent is still working on, or one already closed', () => {
    expect(shipClosesIt(row({ status: 'claimed' }))).toBe(false);
    expect(shipClosesIt(row({ status: 'done' }))).toBe(false);
  });

  it('never one with no answer yet', () => {
    expect(shipClosesIt(row({ result: undefined, wrote: { result: undefined } }))).toBe(false);
  });
});

describe('a thread the ship closed', () => {
  const closed = row({ status: 'done', note: 'Shipped to main as 5941bc3.', wrote: { status: app(200), note: app(200) } });

  it('is filed, not news in Needs you', () => {
    expect(closedByItsShip(closed)).toBe(true);
    expect(belongsInInbox(closed)).toBe(false);
  });

  it('an agent closing a thread without a ship is still news, as before', () => {
    const byAgent = row({ status: 'done', wrote: { status: agent(200) } });
    expect(closedByItsShip(byAgent)).toBe(false);
    expect(belongsInInbox(byAgent)).toBe(true);
  });

  it('a close the app wrote apart from the ship note is not taken for one', () => {
    expect(closedByItsShip(row({ status: 'done', note: 'Shipped to main.', wrote: { status: app(300), note: app(200) } }))).toBe(false);
  });
});

describe('in the store', () => {
  let root: string;
  let store: Store;
  let dir: string;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-closes-'));
    dir = path.join(root, 'team');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ name: 'Team' }));
    store = await new Store({ accountRoot: root, products: [] }).init();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const make = (result: string, now: number) => {
    const w = store.modules.workItemsDisk;
    const it = w.createWorkItem(dir, { title: 'A change', labels: ['founder'] }, { source: 'founder', now });
    w.updateWorkItem(dir, it.id, { result }, { source: 'agent', now: now + 1 });
    return it.id;
  };
  const read = (id: string) => store.readItem('team', id)!;

  it('a ship closes the thread whose agent offered only closing', () => {
    const id = make(ANSWER, 1000);
    store.shipped('team', id, { sha: 'abc1234', labels: ['founder'] });
    expect(read(id)).toMatchObject({ status: 'done', note: 'Shipped to main as abc1234.' });
    expect(closedByItsShip(read(id))).toBe(true);
  });

  it('a ship leaves open the thread that still offers a choice', () => {
    const id = make('## Options\n1. Ship it\n2. Change the copy first', 1000);
    store.shipped('team', id, { sha: 'abc1234', labels: ['founder'] });
    expect(read(id).status).toBe('open');
  });

  it('threads shipped before this are closed when the app starts, and only those', () => {
    const w = store.modules.workItemsDisk;
    const old = make(ANSWER, 1000);
    w.updateWorkItem(dir, old, { note: 'Shipped to main as abc1234.' }, { source: 'system', now: 2000 });
    const replied = make(ANSWER, 1000);
    w.updateWorkItem(dir, replied, { note: 'Shipped to main as abc1234.' }, { source: 'system', now: 2000 });
    w.updateWorkItem(dir, replied, { answer: 'one more thing' }, { source: 'founder', now: 3000 });
    const reopened = make(ANSWER, 1000);
    w.updateWorkItem(dir, reopened, { note: 'Shipped to main as abc1234.', status: 'done' }, { source: 'system', now: 2000 });
    w.updateWorkItem(dir, reopened, { status: 'open' }, { source: 'founder', now: 3000 });
    const neverShipped = make(ANSWER, 1000);

    expect(store.closeShippedThreads(4000)).toBe(1);
    expect(read(old).status).toBe('done');
    expect(closedByItsShip(read(old))).toBe(true);
    for (const id of [replied, reopened, neverShipped]) expect(read(id).status).toBe('open');
    expect(store.closeShippedThreads(5000)).toBe(0);
  });
});

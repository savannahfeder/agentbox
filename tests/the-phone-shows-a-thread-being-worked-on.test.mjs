// THE PHONE SHOWS A THREAD BEING WORKED ON, AND WHAT IT IS DOING.
//
// What she reported (2026-10-17): on the phone site, "if I start a task ... I
// can't really see tasks that are in progress. It just says waiting and then
// when it's done, it goes into my needs review". Reproduced that morning with
// the site built from this branch against her real threads published by this
// Mac's own publisher: In progress listed four threads and none of them showed
// it was running, because a thread's copy online is its row and history only
// and the supervisor's running list never went up.
//
// Now a thread's copy carries `live` while an agent runs on it (since when,
// here or in the cloud, its current step), refreshed while it runs and gone
// when it stops, and the phone draws it as the window does. A copy the Mac has
// not refreshed for ten minutes (the Mac asleep) is not shown as running.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPhoneInbox } from '../main/phone-inbox.mjs';
import { phoneView } from '../renderer/src/cloud-bridge.ts';
import { Supervisor } from '../main/supervisor.mjs';

const T = Date.UTC(2026, 9, 17, 18, 0);
const row = (id) => ({ id, title: `thread ${id}`, status: 'claimed', createdAt: T - 60_000, updatedAt: T - 60_000 });

function publisher({ live }) {
  const sent = [];
  let now = T;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-live-'));
  const inbox = createPhoneInbox({
    backend: {
      async putPhoneProject() {}, async dropPhoneThreads() {}, async dropPhoneProject() {},
      async putPhoneThreads(device, project, batch) { for (const b of batch) sent.push({ item: b.item, live: b.snapshot.live ?? null }); },
      async waitingPhoneCommands() { return []; }, async claimPhoneCommand() { return null; }, async markPhoneCommand() {},
    },
    owner: 'o', device: 'a1b2c3d4e5f6', projects: () => [{ slug: 'p', name: 'P' }],
    listItems: () => [row('w-aaaaaaaaaa'), row('w-bbbbbbbbbb')],
    historyOf: () => [], apply: async () => ({}), stateFile: path.join(dir, 's.json'),
    now: () => now, liveOf: (slug, id) => live(id, now),
  });
  return { inbox, sent, tick: (ms) => { now += ms; } };
}

describe('the Mac\'s copy of a thread being worked on', () => {
  it('carries when it started, where, and its current step; a thread not running carries none', async () => {
    const p = publisher({ live: (id) => (id === 'w-aaaaaaaaaa' ? { since: T - 30_000, where: 'cloud', doing: [{ label: 'Running the tests', startedAt: T - 5_000 }] } : null) });
    await p.inbox.syncOnce();
    const a = p.sent.find((s) => s.item === 'w-aaaaaaaaaa');
    expect(a.live).toEqual({ since: T - 30_000, where: 'cloud', doing: [{ label: 'Running the tests', startedAt: T - 5_000 }], at: T });
    expect(p.sent.find((s) => s.item === 'w-bbbbbbbbbb').live).toBe(null);
  });

  it('a new step goes up at most every 30 seconds, and its stopping at once', async () => {
    let doing = 'Reading the plan';
    let running = true;
    const p = publisher({ live: (id) => (id === 'w-aaaaaaaaaa' && running ? { since: T, where: 'mac', doing: [{ label: doing, startedAt: T }] } : null) });
    await p.inbox.syncOnce();
    p.sent.length = 0;
    doing = 'Editing App.tsx';
    p.tick(10_000);
    await p.inbox.syncOnce();
    expect(p.sent).toEqual([]);
    p.tick(25_000);
    await p.inbox.syncOnce();
    expect(p.sent.map((s) => s.live?.doing[0].label)).toEqual(['Editing App.tsx']);
    p.sent.length = 0;
    running = false;
    p.tick(1_000);
    await p.inbox.syncOnce();
    expect(p.sent).toEqual([{ item: 'w-aaaaaaaaaa', live: null }]);
  });

  it('carries at most three steps, each short, with nothing secret in them', async () => {
    const key = 'sk-ant-oat01-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'; // a made-up key, to prove it is hidden. public-check: allow
    const steps = [`Running curl -H "Authorization: Bearer ${key}"`, 'x'.repeat(500), 'Three', 'Four'].map((label) => ({ label, startedAt: T }));
    const p = publisher({ live: (id) => (id === 'w-aaaaaaaaaa' ? { since: T, where: 'mac', doing: steps } : null) });
    await p.inbox.syncOnce();
    const { doing } = p.sent.find((s) => s.item === 'w-aaaaaaaaaa').live;
    expect(doing.map((d) => d.label.length <= 160)).toEqual([true, true, true]);
    expect(JSON.stringify(doing)).not.toContain(key);
  });

  it('is sent again while it runs, so the phone knows the Mac is still there', async () => {
    const p = publisher({ live: (id) => (id === 'w-aaaaaaaaaa' ? { since: T, where: 'mac', doing: [] } : null) });
    await p.inbox.syncOnce();
    p.sent.length = 0;
    p.tick(60_000);
    await p.inbox.syncOnce();
    expect(p.sent).toEqual([]);
    p.tick(3 * 60_000);
    await p.inbox.syncOnce();
    expect(p.sent.map((s) => s.item)).toEqual(['w-aaaaaaaaaa']);
  });
});

describe('what the supervisor tells the phone', () => {
  const sessions = new Map([
    ['w-aaaaaaaaaa', { product: 'p', startedAt: T, cloud: { box: 1 }, activeTools: new Map([['t1', { id: 't1', label: 'Running the tests', detail: 'npm test', startedAt: T + 1 }]]) }],
    ['w-bbbbbbbbbb', { product: 'p', startedAt: T, remoteIdle: true }],
  ]);
  const liveFor = (product, id) => Supervisor.prototype.liveFor.call({ sessions }, product, id);

  it('is the run on that thread of that project, and nothing else', () => {
    expect(liveFor('p', 'w-aaaaaaaaaa')).toEqual({ since: T, where: 'cloud', doing: [{ label: 'Running the tests', startedAt: T + 1 }] });
    expect(liveFor('q', 'w-aaaaaaaaaa')).toBe(null);
    expect(liveFor('p', 'w-bbbbbbbbbb')).toBe(null);
    expect(liveFor('p', 'w-cccccccccc')).toBe(null);
  });
});

describe('the phone', () => {
  const snapshot = (id, live) => ({ v: 3, item: { ...row(id) }, history: [], ...(live ? { live } : {}) });
  const rows = (threads) => ({ projects: [{ device: 'a1b2c3d4e5f6', project: 'p', name: 'P' }], threads: threads.map(([id, live]) => ({ device: 'a1b2c3d4e5f6', project: 'p', item: id, snapshot: snapshot(id, live) })), commands: [] });

  it('draws a thread being worked on as running, with where and its step', () => {
    const view = phoneView(rows([['w-aaaaaaaaaa', { since: T - 30_000, where: 'cloud', doing: [{ label: 'Running the tests', startedAt: T - 5_000 }], at: T - 1_000 }], ['w-bbbbbbbbbb', null]]), T);
    expect(view.running).toEqual([{ itemId: 'w-aaaaaaaaaa', product: 'p@a1b2c3d4e5f6', startedAt: T - 30_000, where: 'cloud', tail: [], activity: [{ id: 'live-0', label: 'Running the tests', detail: '', startedAt: T - 5_000 }] }]);
  });

  it('does not call a thread running when the Mac has not said so for ten minutes', () => {
    const view = phoneView(rows([['w-aaaaaaaaaa', { since: T - 3_600_000, where: 'mac', doing: [], at: T - 11 * 60_000 }]]), T);
    expect(view.running).toEqual([]);
  });

  it('a run on the Mac carries no `where`, as the window draws it', () => {
    const view = phoneView(rows([['w-aaaaaaaaaa', { since: T - 30_000, where: 'mac', doing: [], at: T - 1_000 }]]), T);
    expect(view.running).toEqual([{ itemId: 'w-aaaaaaaaaa', product: 'p@a1b2c3d4e5f6', startedAt: T - 30_000, tail: [], activity: [] }]);
  });

  it('two computers running a thread of the same id each mark their own row', () => {
    const one = { device: 'a1b2c3d4e5f6', project: 'p', name: 'P' };
    const two = { device: 'f6e5d4c3b2a1', project: 'p', name: 'P' };
    const live = { since: T, where: 'mac', doing: [], at: T };
    const view = phoneView({
      projects: [one, two],
      threads: [
        { device: one.device, project: 'p', item: 'w-aaaaaaaaaa', snapshot: snapshot('w-aaaaaaaaaa', null) },
        { device: two.device, project: 'p', item: 'w-aaaaaaaaaa', snapshot: snapshot('w-aaaaaaaaaa', live) },
      ],
      commands: [],
    }, T);
    const onTwo = view.items.find((i) => i.product === 'p@f6e5d4c3b2a1');
    expect(onTwo.id).not.toBe('w-aaaaaaaaaa');
    expect(view.running.map((r) => [r.itemId, r.product])).toEqual([[onTwo.id, 'p@f6e5d4c3b2a1']]);
  });

  it('puts the running list where the screens read it', () => {
    const src = fs.readFileSync(new URL('../renderer/src/cloud-bridge.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/supervisor: \{ \.\.\.SUPERVISOR, running: view\.running,/);
  });
});

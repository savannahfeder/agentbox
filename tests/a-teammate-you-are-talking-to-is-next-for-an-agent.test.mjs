// The power test of 2026-10-25: both testers made a teammate after sending a
// burst of threads, typed what they wanted, and watched "Waiting for a free
// agent" for over a minute while In progress showed its setup run queued
// behind four ordinary threads. "It's a conversation, not a job": the person
// is sitting in the chat waiting for its question. A run woken by your own
// words in a teammate's chat now goes next for a free agent, ahead of work
// nobody is watching, without stopping anything already running. Run now
// still comes first, and a teammate's own duties and hand-offs wait their turn.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { CHAT_LABEL } from '../shared/teammates.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const NOW = 1_787_600_000_000;

const store = (items) => ({ listItems: () => items, listProducts: () => [], isDue: () => true, settleAnswer() {} });
const row = (id, extra = {}) => ({
  id, product: 'agentbox', status: 'open', kind: 'directive', labels: ['founder'],
  priority: 5, createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false, ...extra,
});
const mate = (id, labels, extra = {}) => row(id, { labels: ['founder', 'teammate:t-aaaaaaaaaa', 'hop:0', ...labels], createdAt: NOW + 60_000, ...extra });

let sup; let spawned; let killed;
const build = (items, slots = 1, order = []) => {
  sup = new Supervisor({ home: ONE_ACCOUNT_HOME, storeRoot: '/nonexistent-zero-root', maxConcurrentSessions: slots, authProfiles: ['default'] }, store(items), '/nonexistent-app');
  sup.productOrder = order;
  spawned = []; killed = [];
  sup.spawnWorker = (item) => { spawned.push(item.id); sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW, tail: [] }); };
  sup._kill = (session) => { killed.push(session.itemId); sup.sessions.delete(session.itemId); return true; };
  sup._saveState = () => {};
};

beforeEach(() => build([]));

describe('the next free agent', () => {
  it('goes to the teammate you are talking to, ahead of older threads', async () => {
    build([row('w-old-1'), row('w-old-2'), mate('w-setup', [CHAT_LABEL])], 1);
    await sup.tick();
    expect(spawned).toEqual(['w-setup']);
  });

  it('goes to it even ahead of a higher project or a higher tag', async () => {
    build([row('w-top', { product: 'first', priority: 8 }), mate('w-setup', [CHAT_LABEL], { product: 'second' })], 1, ['first', 'second']);
    await sup.tick();
    expect(spawned).toEqual(['w-setup']);
  });

  it('stops nothing that is already running to make room', async () => {
    build([row('w-busy'), mate('w-setup', [CHAT_LABEL])], 1);
    sup.sessions.set('w-busy', { itemId: 'w-busy', product: 'agentbox', startedAt: NOW, tail: [] });
    await sup.tick();
    expect(killed).toEqual([]);
    expect(spawned).toEqual([]);
  });

  it('still goes to Run now first', async () => {
    build([row('w-pushed', { priority: 2 }), mate('w-setup', [CHAT_LABEL])], 1);
    sup.runNow('agentbox', 'w-pushed');
    await sup.tick();
    expect(spawned).toEqual(['w-pushed']);
  });

  it('does not go to a teammate\'s duty or a hand-off ahead of older threads', async () => {
    build([row('w-old'), mate('w-duty', ['duty:d-1']), mate('w-pass', ['from:t-bbbbbbbbbb'])], 1);
    await sup.tick();
    expect(spawned).toEqual(['w-old']);
  });
});

describe('which teammate runs are marked as talk', () => {
  it('a run your own words in its chat woke, and not a duty, a hand-off or a thread speaking for you', async () => {
    const { loadStore } = await import('../main/store-modules.mjs');
    const { Teammates } = await import('../main/teammates.mjs');
    const { writeChat } = await import('../main/store/teammates-files.mjs');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-talk-'));
    const mods = await loadStore();
    const w = mods.workItemsDisk;
    const store2 = {
      config: { storeRoot: root, accountId: 'acct-talk' }, modules: mods,
      listProducts: () => [{ slug: 'site', dir: root, name: 'Site', repoPath: '/r' }],
      productDir: () => root,
      listItems: () => w.readWorkItems(root).map((i) => ({ ...i, product: 'site' })),
    };
    const team = new Teammates(store2);
    const now = Date.now();
    const a = team.describe({ text: 'Watch CI and fix flaky tests', product: 'site' }, now).teammate;
    const b = team.create({ starter: 'support', product: 'site' }, now);
    const c = team.create({ starter: 'growth', product: 'site' }, now);
    writeChat(team.dir(), { kind: 'msg', from: 'you', to: [b.id], text: 'Answer the refund email', via: 'w-x', viaProduct: 'site' }, now);
    writeChat(team.dir(), { kind: 'pass', from: 'you', to: c.id, title: 'Sort the signup numbers', details: 'x' }, now);
    await team.tick({ items: store2.listItems(), now });
    const runOf = (t) => store2.listItems().find((i) => (i.labels ?? []).includes(`teammate:${t.id}`));
    expect(runOf(a).labels).toContain(CHAT_LABEL);
    expect(runOf(b).labels).not.toContain(CHAT_LABEL);
    expect(runOf(c).labels).not.toContain(CHAT_LABEL);
  });
});

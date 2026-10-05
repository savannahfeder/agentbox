// A REPLY WHOSE AGENT WAS STILL BEING SET UP WHEN THE APP QUIT WAS LOST.
//
// What broke (2026-10-04, w-53a72e6e7f): an Urgent Astral Video task waited
// over an hour while a Medium task in the same project was started ahead of
// it. Replaying the real scheduler against her store as it stood at 13:07,
// right after a restart, picks the Urgent task first, unless its reply is
// already marked as handed to an agent. No agent had ever started on it.
//
// That mark is written and saved the moment the tick picks a reply, before
// the agent starts. Starting can wait several seconds to minutes while the
// task's folder is made and the checkout photographed (`_folderFirst`,
// `_photoFirst`). Quitting the app in that window cleared the waiting start
// but left the saved mark, so after the restart every tick read the reply as
// delivered and skipped it, with nothing running on it. The app restarted at
// 13:07:15 that day.
//
// Measured here with a real state file: before the fix the restarted app
// starts nothing for the reply.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
const NOW = 1_787_600_000_000;

const store = (items) => ({
  listItems: () => items,
  listProducts: () => [],
  isDue: () => true,
  settleAnswer() {},
});

const replied = (id, extra = {}) => ({
  id, product: 'video', status: 'open', kind: 'directive', labels: ['founder'],
  priority: 9, answer: 'another user hit this too', createdAt: NOW - 120_000, updatedAt: NOW - 60_000,
  claim: null, claimExpired: false,
  wrote: { answer: { ts: NOW - 60_000, source: 'founder' } },
  ...extra,
});

const fresh = (id) => ({
  id, product: 'video', status: 'open', kind: 'directive', labels: ['founder'],
  priority: 5, createdAt: NOW, updatedAt: NOW, claim: null, claimExpired: false,
});

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'reply-restart-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const build = (items) => {
  const sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    store(items),
    '/nonexistent-app',
  );
  sup.started = [];
  return sup;
};

// What `_folderFirst` does with a start whose folder is not made yet: parks it
// and returns. The folder is made on another thread and the start runs later.
const parksForItsFolder = (sup) => {
  sup.spawnWorker = (item, opts = {}) => {
    sup._preparing.set(item.id, { item, opts, engine: 'claude' });
  };
};

const startsAtOnce = (sup) => {
  sup.spawnWorker = (item, opts = {}) => {
    sup.started.push(item.id);
    sup.sessions.set(item.id, { itemId: item.id, product: item.product, startedAt: NOW });
  };
};

describe('quitting while a reply waits for its folder', () => {
  it('starts the reply after the restart', async () => {
    const items = [replied('w-urgent')];
    const before = build(items);
    parksForItsFolder(before);
    await before.tick();
    expect(before._preparing.has('w-urgent')).toBe(true);
    before.stop();

    const after = build(items);
    startsAtOnce(after);
    await after.tick();
    expect(after.started).toEqual(['w-urgent']);
  });

  it('starts it ahead of a lower task in the same project', async () => {
    const items = [replied('w-urgent'), fresh('w-medium')];
    const before = build(items);
    parksForItsFolder(before);
    before.sessions.set('w-a', { itemId: 'w-a' });
    before.sessions.set('w-b', { itemId: 'w-b' });
    await before.tick();
    before.stop();

    const after = build(items);
    startsAtOnce(after);
    after.sessions.set('w-a', { itemId: 'w-a' });
    after.sessions.set('w-b', { itemId: 'w-b' });
    await after.tick();
    expect(after.started).toEqual(['w-urgent']);
  });

  // The boundary on the other side: a reply whose agent really did start is
  // still delivered, and a restart must not hand it to a second agent.
  it('does not start a second agent on a reply that was really delivered', async () => {
    const items = [replied('w-urgent')];
    const before = build(items);
    startsAtOnce(before);
    await before.tick();
    expect(before.started).toEqual(['w-urgent']);
    before.sessions.clear();
    before.stop();

    const after = build(items);
    startsAtOnce(after);
    await after.tick();
    expect(after.started).toEqual([]);
  });
});

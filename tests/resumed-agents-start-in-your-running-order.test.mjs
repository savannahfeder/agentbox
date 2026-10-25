// RESUMED AGENTS START IN YOUR RUNNING ORDER, NOT IN THE ORDER THEY SIT ON DISK.
//
// Reported 2026-10-11 (w-6165eb69b4): every thread ticked with ⌘A, then
// "Resume Agents". The running order was Personal, Agentbox Team, Astral,
// Astral Video, ..., My Workspace. What started was a High and a Medium and a
// Low on Agentbox Team and a Medium on My Workspace, while a Personal row and
// an Agentbox Team URGENT row sat in In progress waiting for a slot.
//
// The cause was three loops that never asked the score. `resumeItems` walked
// `store.listItems()` (folder by folder, then oldest first) and spawned until
// the fleet was full; the rows left over went into `_resumeQueue`, a Set,
// which the tick drained in the order they went in; and the sweep that puts
// sessions back after a restart walked `_liveSessions` in the order they were
// first remembered. The fresh-work queue was the only spawn path ranked by
// `_score`, so the one place she asked for many rows at once was the one place
// her order counted for nothing.
//
// Measured with two slots and five ticked rows before the fix: the started
// pair was the Agentbox Team Low and Medium, and Personal came out of the
// queue last.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

// A MAC WITH ONE CLAUDE LOGIN ON IT (see resume-a-finished-row.test.mjs).
const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';

const row = (id, product, priority, createdAt) => ({
  id, product, priority, createdAt, status: 'open', kind: 'directive',
  labels: ['founder'], title: id, wrote: {},
});

// In the order the store hands them back: folders alphabetically, oldest
// first inside one. Exactly the order that is NOT her running order.
const STORE = () => [
  row('w-team-low', 'agentbox-team', 2, 1),
  row('w-team-medium', 'agentbox-team', 5, 2),
  row('w-team-urgent', 'agentbox-team', 9, 3),
  row('w-workspace-medium', 'my-workspace', 5, 4),
  row('w-personal-low', 'personal', 2, 5),
];
const EVERY_ID = STORE().map((i) => i.id);

let root;
let items;
let sup;
let spawned;

const build = (slots) => {
  const s = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: root, maxConcurrentSessions: slots, authProfiles: ['default'] },
    {
      listItems: () => items,
      listProducts: () => [],
      isDue: () => true,
      answerItem: () => {},
    },
    root,
  );
  s.productOrder = ['personal', 'agentbox-team', 'my-workspace'];
  s.spawnWorker = (item, opts) => { spawned.push(item.id); s.sessions.set(item.id, { itemId: item.id }); };
  return s;
};

// Every running session finishes, so the next pass has every slot again.
const freeEverySlot = () => sup.sessions.clear();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-resume-order-'));
  items = STORE();
  spawned = [];
  sup = build(2);
});
afterEach(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch {} });

describe('resuming many ticked threads at once', () => {
  it('gives the free slots to the top of your running order', () => {
    // Her report: Personal first, then Agentbox Team's Urgent.
    const r = sup.resumeItems(EVERY_ID);
    expect(spawned).toEqual(['w-personal-low', 'w-team-urgent']);
    expect(r).toMatchObject({ resumed: 2, queued: 3 });
  });

  it('lets the rest out of the queue in that same order as slots free', () => {
    sup.resumeItems(EVERY_ID);
    spawned = [];
    freeEverySlot();
    sup._drainResumeQueue(items);
    expect(spawned).toEqual(['w-team-medium', 'w-team-low']);
    freeEverySlot();
    sup._drainResumeQueue(items);
    expect(spawned).toEqual(['w-team-medium', 'w-team-low', 'w-workspace-medium']);
  });

  it('starts all of them, in order, when there is room for all of them', () => {
    // The boundary on the other side: nothing waits, and the order still holds.
    sup = build(5);
    sup.resumeItems(EVERY_ID);
    expect(spawned).toEqual(['w-personal-low', 'w-team-urgent', 'w-team-medium', 'w-team-low', 'w-workspace-medium']);
  });

  it('puts a thread you dragged where you dragged it', () => {
    // A place replaces the score outright (`placedScore`), so a My Workspace
    // row dragged above everything starts first even though its project is last.
    sup.threadPlaces = { 'w-workspace-medium': 950 };
    sup.resumeItems(EVERY_ID);
    expect(spawned).toEqual(['w-workspace-medium', 'w-personal-low']);
  });

  it('ranks a level an agent wrote like yours', () => {
    // A level counts whoever set it (w-5ac9c9006d, 2026-10-16), so an agent's
    // nine starts first and the Medium waits.
    items = [
      row('w-team-medium', 'agentbox-team', 5, 1),
      { ...row('w-agent-nine', 'agentbox-team', 9, 2), wrote: { priority: { ts: 1, source: 'agent' } } },
      row('w-team-high', 'agentbox-team', 7, 3),
    ];
    sup.resumeItems(items.map((i) => i.id));
    expect(spawned).toEqual(['w-agent-nine', 'w-team-high']);
  });

  it('keeps the oldest first between two threads of the same standing', () => {
    items = [row('w-newer', 'agentbox-team', 5, 20), row('w-older', 'agentbox-team', 5, 10)];
    sup = build(1);
    sup.resumeItems(['w-newer', 'w-older']);
    expect(spawned).toEqual(['w-older']);
  });
});

// The same complaint after "Restart to update": the sweep that hands each
// interrupted row its own session back used the order they were remembered in.
describe('putting sessions back after a restart', () => {
  const layTranscript = (cwd, sessionId) => {
    const dir = path.join(root, 'fake-home', '.claude', 'projects', String(cwd).replace(/[^a-zA-Z0-9]/g, '-'));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), '{"type":"user"}\n');
  };

  it('resumes the top of your running order first when slots are short', () => {
    // Remembered in store order, which is how they were first started.
    for (const item of STORE()) {
      layTranscript(root, `sess-${item.id}`);
      sup._liveSessions[item.id] = { sessionId: `sess-${item.id}`, product: item.product, cwd: root, profile: path.join(root, 'fake-home', '.claude') };
    }
    const out = sup.recoverInterrupted('startup');
    expect(spawned).toEqual(['w-personal-low', 'w-team-urgent']);
    expect(out).toMatchObject({ resumed: 2, queued: 3 });
  });
});

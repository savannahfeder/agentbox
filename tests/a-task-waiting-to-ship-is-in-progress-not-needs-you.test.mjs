// A task waiting for the app to ship it is In progress, never Needs you.
//
// Reported 2026-10-08 with a screenshot: "Usage not showing up" sat in Needs
// you. Its owner had picked "Ship it", the agent added the `ship` label and
// ended with "Agentbox is now shipping the usage fix; nothing needs you unless
// it fails", and the only option on it was "Close this task". Nothing on it
// needed anybody: the next move was the app's ship queue, not a person. The
// row reached the inbox through `answerSettled` (an agent finished acting on
// the owner's answer), which cannot see that the app still owes it a ship.
//
// Their words: "it's waiting on us so it only needs our review when it's
// finished". So the supervisor now reports the rows its ship queue still owes
// (`shipping`), those rows are In progress reading "Shipping", and they come
// back to the inbox the moment the queue has dealt with them: shipped, which
// takes the label off, or failed, which hands the row back to its agent.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { belongsInInbox, belongsInProgress, belongsOnTheRail, stoppable } from '../renderer/src/list-rules';
import { liveLine, shortWord } from '../renderer/src/live-line';
import { SHIP_LABEL, ShipQueue, waitingToShip } from '../main/ship-queue.mjs';

const NOW = 1_791_514_000_000;

// The reported row, as the fold hands it over: the owner answered "Ship it",
// a session acted on that and wrote its result, and the label is on.
const markedToShip = (extra) => ({
  id: 'w-usage', status: 'open', kind: 'bug', labels: ['bug', SHIP_LABEL],
  title: 'Usage not showing up', updatedAt: NOW,
  answer: 'Ship it (recommended)', answeredThrough: NOW - 60_000,
  result: 'Agentbox is now shipping the usage fix; nothing needs you unless it fails.',
  wrote: {
    answer: { ts: NOW - 60_000, source: 'founder' },
    result: { ts: NOW - 30_000, source: 'agent' },
    labels: { ts: NOW - 30_000, source: 'agent' },
  },
  ...extra,
});
// Their own ask, answered and left open by an agent that then marked it.
const herAskMarked = (extra) => ({
  id: 'w-ask', status: 'open', kind: 'directive', labels: ['founder', SHIP_LABEL], title: 'her ask',
  result: 'Done, marked to ship.', updatedAt: NOW,
  wrote: { title: { ts: NOW - 90_000, source: 'founder' }, result: { ts: NOW - 5_000, source: 'agent' } },
  ...extra,
});

const inbox = (i, shipping) => belongsInInbox(i, { now: NOW, shipping });
const progress = (i, shipping) => belongsInProgress(i, { now: NOW, shipping });

describe('a task the app still owes a ship', () => {
  it('the reported row is In progress and not in Needs you', () => {
    expect(inbox(markedToShip(), true)).toBe(false);
    expect(progress(markedToShip(), true)).toBe(true);
  });

  it('their own answered ask, marked to ship, waits in In progress too', () => {
    expect(inbox(herAskMarked(), true)).toBe(false);
    expect(progress(herAskMarked(), true)).toBe(true);
  });

  it('a row its agent set blocked as well as marking it waits in In progress too', () => {
    const blocked = markedToShip({ status: 'blocked' });
    expect(inbox(blocked, true)).toBe(false);
    expect(progress(blocked, true)).toBe(true);
  });

  it('stays on the rail, so the thread is still somewhere you can see it', () => {
    expect(belongsOnTheRail(markedToShip(), { now: NOW, shipping: true })).toBe(true);
  });

  it('offers no Stop, because stopping the row does not stop the ship', () => {
    expect(stoppable(markedToShip(), { now: NOW })).toBe(false);
  });
});

describe('once the queue has dealt with it, it is the owner\'s again', () => {
  it('shipped: the label is gone and the finished work is in Needs you', () => {
    const shipped = markedToShip({ labels: ['bug'] });
    expect(inbox(shipped, false)).toBe(true);
    expect(progress(shipped, false)).toBe(false);
  });

  it('a label the queue no longer owes anything for (already shipped, or no ship set up) is not hidden', () => {
    expect(inbox(markedToShip(), false)).toBe(true);
    expect(inbox(herAskMarked(), false)).toBe(true);
  });

  it('a row with a session on it is still the live rule\'s, shipping or not', () => {
    expect(belongsInInbox(markedToShip(), { now: NOW, live: true, shipping: false })).toBe(false);
    expect(belongsInProgress(markedToShip(), { now: NOW, live: true, shipping: false })).toBe(true);
  });
});

describe('what the In progress row says', () => {
  it('says Shipping, and says when it comes back', () => {
    const live = liveLine(markedToShip(), { inProgress: true, shipping: true, now: NOW });
    expect(live?.state).toBe('shipping');
    expect(shortWord('shipping')).toBe('Shipping');
    expect(live?.line).toMatch(/shipping this/i);
    expect(live?.line).toMatch(/back to you/i);
  });

  it('says nothing about shipping on a row the queue does not owe', () => {
    const live = liveLine(markedToShip(), { inProgress: true, now: NOW });
    expect(live?.state).not.toBe('shipping');
  });
});

describe('which rows the queue still owes a ship', () => {
  let tmp; let repo; let userDir; let folders;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-waiting-'));
    repo = path.join(tmp, 'repo');
    userDir = path.join(tmp, 'user');
    folders = path.join(tmp, 'folders');
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'scripts', 'ship.mjs'), '');
    fs.mkdirSync(userDir, { recursive: true });
    for (const id of ['w-a', 'w-b']) fs.mkdirSync(path.join(folders, id), { recursive: true });
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const products = () => [{ slug: 'team', repoPath: repo }, { slug: 'other', repoPath: repo }];
  const settings = { team: { script: 'scripts/ship.mjs' } };
  const folderFor = (item) => path.join(folders, item.id);
  const row = (id, over = {}) => ({ id, product: 'team', status: 'open', labels: [SHIP_LABEL], wrote: { labels: { ts: 50 } }, ...over });
  const ids = (items, opts = {}) => waitingToShip(items, products(), settings, { folderFor, ...opts }).map((r) => r.item.id);

  it('is every marked row on a project that ships, including one a session is still on', () => {
    expect(ids([row('w-a'), row('w-b')])).toEqual(['w-a', 'w-b']);
  });

  it('is never a row without the label, a finished one, one on a project that does not ship, or one with no folder', () => {
    expect(ids([row('w-a', { labels: [] })])).toEqual([]);
    expect(ids([row('w-a', { status: 'done' })])).toEqual([]);
    expect(ids([row('w-a', { product: 'other' })])).toEqual([]);
    expect(ids([row('w-z')])).toEqual([]);
    expect(waitingToShip([row('w-a')], products(), {}, { folderFor })).toEqual([]);
  });

  it('is never a row already shipped for that label, and is again once it is marked anew', () => {
    const handled = { 'team/w-a': 50 };
    expect(ids([row('w-a')], { handled })).toEqual([]);
    expect(ids([row('w-a', { wrote: { labels: { ts: 51 } } })], { handled })).toEqual(['w-a']);
  });

  it('is what the queue reports to the window, by id', () => {
    fs.writeFileSync(path.join(userDir, 'ship.json'), JSON.stringify(settings));
    const q = new ShipQueue({ store: {}, userDir, folderFor, isLive: () => false });
    expect(q.waitingIds([row('w-a'), row('w-b', { labels: [] })], products())).toEqual(['w-a']);
    fs.writeFileSync(path.join(userDir, 'ship-handled.json'), JSON.stringify({ 'team/w-a': 50 }));
    expect(q.waitingIds([row('w-a')], products())).toEqual([]);
  });
});

describe('the window is told', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  it('the supervisor puts the ids on its status, and the inbox reads them', () => {
    expect(src('main/supervisor.mjs')).toMatch(/shipping = this\.shipQueue\.waitingIds\(/);
    expect(src('main/supervisor.mjs')).toMatch(/paused: this\.paused,\s*shipping,/);
    expect(src('renderer/src/App.tsx')).toMatch(/snap\?\.supervisor\.shipping/);
  });
});

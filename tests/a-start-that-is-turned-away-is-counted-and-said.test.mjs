// A START THAT IS TURNED AWAY IS COUNTED WITH ITS REASON, AND THE THREAD SAYS WHY.
//
// Oct 29 analytics: of 26 installs that wrote a real task, 8 never sent
// run_started, all Macs, with no crash report. The start path had a dozen
// checks that drop a task with at most a console.warn (the setup walk's hold,
// the fleet pause, a Mac taken for asleep, no slot, no live login, the start
// hold, the practice project, no folder, memory), so the counts could not say
// which one, and the thread read "Queued. An agent starts on it as soon as one
// is free" while none would.
//
// The cases:
//   · each refusal sends `run_waiting` with a fixed reason, once per thread and
//     reason, never anything about the task;
//   · a reason outside the closed list is dropped;
//   · a row that does start sends no refusal;
//   · the reasons nothing else on screen explains reach the thread's line, and
//     "no slot" does not (Queued is true then);
//   · a pass stuck on an await is counted as `stuck`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EVENTS, sanitize, WAIT_REASONS } from '../shared/analytics-events.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import { liveLine, shortWord } from '../renderer/src/live-line.ts';

const task = (id, extra = {}) => ({ id, product: 'sample', status: 'open', kind: 'directive', labels: ['founder'], priority: 5, createdAt: Date.now() - 4_000, updatedAt: 1, ...extra });

describe('the count', () => {
  it('is on the approved list and keeps only a reason out of the closed list', () => {
    expect(EVENTS.run_waiting).toBe('An agent could not start yet');
    expect(sanitize('run_waiting', { reason: 'setup', engine: 'codex', seconds: 3, title: 'her row' }))
      .toEqual({ reason: 'setup', engine: 'codex', seconds: 3 });
    expect(sanitize('run_waiting', { reason: '/Users/someone/acme' })).toEqual({});
    expect(sanitize('run_waiting', { reason: 7 })).toEqual({});
    for (const r of ['setup', 'paused', 'asleep', 'stuck', 'brake', 'slot', 'login', 'engine', 'memory', 'held', 'folder', 'slow-folder', 'model', 'cloud', 'practice', 'project', 'claim', 'error']) {
      expect(WAIT_REASONS.has(r)).toBe(true);
    }
  });
});

describe('a pass', () => {
  let dir, sup, counted, started, items, products;

  function setup(rows, { config = {} } = {}) {
    items = rows;
    products = [{ slug: 'sample', dir, repoPath: dir }];
    sup = new Supervisor({ home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'], ...config },
      { listItems: () => items, listProducts: () => products, isDue: () => true, settleAnswer() {} }, dir);
    sup._engineFor = () => 'claude';
    counted = [];
    sup.count = (name, props) => counted.push([name, props]);
    started = [];
    sup.spawnWorker = (item) => {
      started.push(item.id);
      sup.sessions.set(item.id, { itemId: item.id, engine: 'claude', product: 'sample', startedAt: Date.now(), tail: [] });
    };
  }
  const refusals = () => counted.filter(([n]) => n === 'run_waiting').map(([, p]) => p.reason);

  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'turned-away-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('a row that starts sends no refusal', async () => {
    setup([task('a')]);
    await sup.tick();
    expect(started).toEqual(['a']);
    expect(refusals()).toEqual([]);
  });

  it('the setup walk holding agents is counted as setup, once, and the thread says so', async () => {
    setup([task('a')]);
    sup.firstRunWalking(true);
    await sup.tick();
    await sup.tick();
    expect(started).toEqual([]);
    expect(refusals()).toEqual(['setup']);
    expect(counted.find(([n]) => n === 'run_waiting')[1]).toMatchObject({ reason: 'setup', engine: 'claude' });
    expect(sup.status().cannotStart).toEqual({ a: { why: 'setup', tool: 'Claude Code' } });
  });

  it('the fleet paused is counted as paused', async () => {
    setup([task('a')]);
    sup.paused = true;
    await sup.tick();
    expect(refusals()).toEqual(['paused']);
  });

  it('a Mac taken for asleep is counted as asleep, and the thread says so', async () => {
    setup([task('a')]);
    sup.asleep = () => true;
    await sup.tick();
    expect(started).toEqual([]);
    expect(refusals()).toEqual(['asleep']);
    expect(sup.status().cannotStart.a.why).toBe('asleep');
  });

  it('no live login is counted as login and said; every slot busy is counted as slot and left as Queued', async () => {
    setup([task('a')]);
    sup._liveProfilesFor = () => [];
    await sup.tick();
    expect(started).toEqual([]);
    expect(refusals()).toEqual(['login']);
    expect(sup.status().cannotStart.a.why).toBe('login');

    setup([task('b'), ...['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'].map((id) => task(id))]);
    sup.config.maxConcurrentSessions = 1;
    sup.sessions.set('r0', { itemId: 'r0', engine: 'claude', product: 'sample', startedAt: Date.now(), tail: [] });
    await sup.tick();
    expect(started).toEqual([]);
    expect(new Set(refusals())).toEqual(new Set(['slot']));
    expect(sup.status().cannotStart?.b).toBeUndefined();
  });

  it('a task in the practice project is counted as practice; the walk\'s own rows are not', async () => {
    setup([task('a'), task('w', { labels: ['founder', 'first-run'] })]);
    products = [{ slug: 'sample', dir, practice: true }];
    sup.worksHere = () => false;
    await sup.tick();
    expect(refusals()).toEqual(['practice']);
  });

  it('a reply the queue walks past because another session holds the thread is counted as claim', async () => {
    setup([task('a', { answer: 'go on', status: 'open' })]);
    sup._isContinuation = () => true;
    sup.claimHeldElsewhere = () => true;
    await sup.tick();
    expect(refusals()).toEqual(['claim']);
  });

  it('a pass stuck on an await is counted as stuck, once', async () => {
    setup([task('a')]);
    sup._ticking = true;
    sup._lastTickAt = Date.now() - 3 * 60_000;
    await sup.tick();
    await sup.tick();
    expect(refusals()).toEqual(['stuck']);
  });

  it('a start that throws is counted as error before the pass ends, and said', async () => {
    setup([task('a')]);
    sup.spawnWorker = () => { throw new Error('boom'); };
    await expect(sup.tick()).rejects.toThrow('boom');
    expect(refusals()).toEqual(['error']);
    expect(sup.status().cannotStart.a.why).toBe('error');
  });

  it('a folder still being made after two minutes is counted as slow-folder and said; one at a minute is not', async () => {
    setup([task('a')]);
    sup._preparing = new Map([['a', { item: items[0], opts: {}, engine: 'claude', folderSince: Date.now() - 60_000 }]]);
    sup.spawnWorker = () => {};
    await sup.tick();
    expect(refusals()).toEqual([]);
    expect(sup.status().cannotStart?.a).toBeUndefined();
    sup._preparing.get('a').folderSince = Date.now() - 2 * 60_000;
    await sup.tick();
    expect(refusals()).toEqual(['slow-folder']);
    expect(sup.status().cannotStart.a.why).toBe('slow-folder');
  });

  it('a reason forgets itself once the row starts', async () => {
    setup([task('a')]);
    sup.firstRunWalking(true);
    await sup.tick();
    expect(sup.status().cannotStart.a.why).toBe('setup');
    sup.sentByThem([]);
    await sup.tick();
    expect(started).toEqual(['a']);
    expect(sup.status().cannotStart?.a).toBeUndefined();
  });
});

describe('spawnWorker\'s own refusals', () => {
  let dir, sup, counted;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'turned-away-door-'));
    sup = new Supervisor({ home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'] },
      { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {} }, dir);
    counted = [];
    sup.count = (name, props) => counted.push([name, props]);
  });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('a held thread is counted as held and a missing project as project', () => {
    sup._heldFromStarting = () => true;
    sup.spawnWorker(task('a'));
    sup._heldFromStarting = () => false;
    sup.spawnWorker(task('b'));
    expect(counted.map(([, p]) => p.reason)).toEqual(['held', 'project']);
  });
});

describe('the thread\'s line', () => {
  const at = (why, tool = 'Claude Code') => liveLine(task('a'), { inProgress: true, queued: ['a'], cannotStart: { a: { why, tool } } });

  it('says why instead of Queued, for each reason it carries', () => {
    expect(at('setup')).toMatchObject({ state: 'cannot' });
    expect(at('setup').line).toMatch(/setup/i);
    expect(at('asleep').line).toMatch(/asleep/i);
    expect(at('login').line).toMatch(/Claude Code/);
    expect(at('login', 'Codex').line).toMatch(/codex login/);
    expect(at('engine').line).toMatch(/Claude Code/);
    expect(at('memory').line).toMatch(/memory/i);
    expect(at('slow-folder').line).toMatch(/copy of the project/);
    expect(at('error').line).toMatch(/tries again/);
    expect(at('slot')).toMatchObject({ state: 'queued' });
    expect(shortWord('cannot')).toBe('Not started');
  });

  it('a signed-out tool still says signed out, which names the fix', () => {
    const line = liveLine(task('a'), { inProgress: true, queued: ['a'], signInNeeded: { a: 'Claude Code' }, cannotStart: { a: { why: 'login', tool: 'Claude Code' } } });
    expect(line.state).toBe('signin');
  });

  it('the open thread draws the whole sentence, as it does for signed out', () => {
    const live = fs.readFileSync(new URL('../renderer/src/components/Live.tsx', import.meta.url), 'utf8');
    expect(live).toMatch(/live\.state === 'signin' \|\| live\.state === 'limit' \|\| live\.state === 'cannot' \? live\.line : word/);
  });

  it('a row with no reason is still Queued', () => {
    expect(liveLine(task('a'), { inProgress: true, queued: ['a'], cannotStart: {} }).state).toBe('queued');
  });
});

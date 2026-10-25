// TURNING THE CLOUD ON STARTS TWO CLOUD RUNS AT A TIME, NOT TEN.
//
// What broke (2026-10-17): she pressed C by accident, the cloud came on with
// Everything, and the app hung for minutes; Cmd+Q did nothing and only a force
// quit closed it. Read off the code that day: one tick could start up to ten
// cloud runs together (`maxCloudSessions`), and each run's proxy packs the task
// folder, up to 100 MB of documents and the transcript (the launch film's is
// 278 MB) into memory before it sends them, on a Mac that is already full.
//
// Now at most two cloud runs are being packed and sent at once; the next one
// starts when the cloud has taken one of them, or its agent is running
// (tests/a-cloud-run-stops-holding-a-start-slot-once-it-is-sent). Runs already
// going in the cloud do not count.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Supervisor } from '../main/supervisor.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const make = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-starting-'));
  dirs.push(root);
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [], isDue: () => true },
    root,
  );
  sup._cloudReady = () => true;
  // Signed in in the cloud for every engine this Mac offers.
  sup._cloudSignedInAtAll = (engine = 'claude') => sup.engineChoices().some((e) => e.id === engine);
  return sup;
};
const add = (sup, id, extra) => sup.sessions.set(id, { itemId: id, engine: 'claude', cloud: true, child: { kill() {} }, tail: [], ...extra });

describe('cloud runs starting', () => {
  it('leave room while fewer than two are being packed', () => {
    const sup = make();
    expect(sup._cloudSlotFor('claude')).toBe(true);
    add(sup, 'w-1', {});
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });

  it('take no third until one of them has its agent running', () => {
    const sup = make();
    add(sup, 'w-1', {});
    add(sup, 'w-2', {});
    expect(sup._cloudStarting()).toBe(2);
    expect(sup._cloudSlotFor('claude')).toBe(false);
    sup.sessions.get('w-1').sessionId = 's-1';
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });

  // Watched on her Mac that evening: with Everything on and two cloud runs
  // starting, the next thread started on the Mac instead of waiting its turn.
  it('with Everything, the next thread waits its turn rather than starting on this Mac', () => {
    const sup = make();
    const product = { slug: 'p', dir: sup.config.storeRoot, repoPath: '/r' };
    sup.store.listProducts = () => [product];
    const item = { id: 'w-next', product: 'p' };
    add(sup, 'w-1', {});
    add(sup, 'w-2', {});
    expect(sup._localSlotFor('claude')).toBe(true);
    expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-next', engine: 'claude' })).toBe('cloud-wait');
    // A thread that may not go to the cloud starts here as before.
    sup.threadOnMac['w-next'] = true;
    expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-next', engine: 'claude' })).toBe('local');
    // And with "when this Mac is full", this Mac comes first anyway.
    delete sup.threadOnMac['w-next'];
    sup.config.cloudRuns = null;
    expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-next', engine: 'claude' })).toBe('local');
  });

  // Claude's review: the tick and the sweep that resumes interrupted rows asked
  // `_roomFor`, which said yes, then the spawn quietly waited, so a resume was
  // counted as done and never came back.
  it('a thread waiting its turn is not room here, so nothing starts it or makes room for it', () => {
    const sup = make();
    const product = { slug: 'p', dir: sup.config.storeRoot, repoPath: '/r' };
    sup.store.listProducts = () => [product];
    const item = { id: 'w-next', product: 'p' };
    add(sup, 'w-1', {});
    add(sup, 'w-2', {});
    expect(sup._waitsForCloud(item, 'claude')).toBe(true);
    expect(sup._roomFor('claude', item)).toBe(false);
    // A row that cannot go to the cloud is not held.
    sup.threadOnMac['w-next'] = true;
    expect(sup._roomFor('claude', item)).toBe(true);
  });

  it('a start that never got going stops holding others back after ten minutes', () => {
    const sup = make();
    const product = { slug: 'p', dir: sup.config.storeRoot, repoPath: '/r' };
    sup.store.listProducts = () => [product];
    add(sup, 'w-1', { startedAt: Date.now() - 11 * 60_000 });
    add(sup, 'w-2', { startedAt: Date.now() - 11 * 60_000 });
    expect(sup._cloudStarting()).toBe(0);
    expect(sup._waitsForCloud({ id: 'w-next', product: 'p' }, 'claude')).toBe(false);
    sup.sessions.get('w-2').startedAt = Date.now() - 60_000;
    expect(sup._cloudStarting()).toBe(1);
  });

  it('an engine with no cloud does not wait for it', () => {
    const sup = make();
    const product = { slug: 'p', dir: sup.config.storeRoot, repoPath: '/r' };
    sup.store.listProducts = () => [product];
    add(sup, 'w-1', {});
    add(sup, 'w-2', {});
    sup.engineChoices = () => [{ id: 'claude' }];
    expect(sup._waitsForCloud({ id: 'w-next', product: 'p' }, 'codex')).toBe(false);
  });

  // Codex's review: the wait came before the spawn knew a run was one that
  // goes to this Mac anyway, so a typed command or a Codex reply waited too.
  describe('at the spawn, while waiting its turn', () => {
    const spawnWith = (plan, heldHere = []) => {
      const sup = make();
      sup._codexServers = new Map([['/codex-home', { client: { isClosed: () => false }, loaded: new Set(heldHere) }]]);
      const root = sup.config.storeRoot;
      const product = { slug: 'p', dir: root, repoPath: root };
      sup.store.listProducts = () => [product];
      sup._whereToRun = () => 'cloud-wait';
      sup._mayRunHereInstead = () => true;
      sup._folderFirst = () => false;
      sup.workFolderFor = () => root;
      sup.spawnPlan = () => ({ args: [], ...plan });
      sup.prepareClaudePermissions = () => {};
      sup._workerEnv = () => ({});
      sup._saveState = () => {};
      const child = new (class extends EventEmitter {})();
      child.stderr = new EventEmitter();
      sup._spawnCodexWorker = () => child;
      sup.spawnWorker({ id: 'w-x', product: 'p', title: 't', status: 'open', answer: 'go on' }, { engine: 'codex', profile: 'default', continuation: true });
      return sup.sessions.get('w-x') ?? null;
    };
    // Only one this Mac's app-server has open since 2026-10-22
    // (tests/a-reply-to-a-codex-cloud-thread-runs-in-the-cloud).
    it('a Codex reply to a thread this Mac holds starts here', () => {
      const s = spawnWith({ resumeId: 'r-1' }, ['r-1']);
      expect(s).toBeTruthy();
      expect(s.cloud).toBe(false);
    });
    it('anything else waits', () => {
      expect(spawnWith({})).toBe(null);
    });
  });

  it('do not count runs already going, or runs on this Mac', () => {
    const sup = make();
    for (let i = 0; i < 5; i += 1) add(sup, `w-run-${i}`, { sessionId: `s-${i}` });
    sup.sessions.set('w-mac', { itemId: 'w-mac', engine: 'claude', cloud: false, child: { kill() {} }, tail: [] });
    expect(sup._cloudStarting()).toBe(0);
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });
});

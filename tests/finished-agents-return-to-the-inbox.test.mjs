// A clean run saved its answer but retained a claim while its shared tool
// server kept heartbeating. Reproduce that lifecycle through the real store
// and both list predicates, including late beats and a replacement worker.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';
import * as disk from '../main/store/work-items.mjs';
import { belongsInInbox, belongsInProgress } from '../renderer/src/list-rules.ts';
import { appHome } from '../main/store/home.mjs';

let root, dir, store, sup, item, session, claim;
beforeEach(async () => {
  // A real run answers after the request. Fast synchronous fixtures can put
  // both in the same millisecond, which intentionally does not count as a
  // newer answer. Control Date only; stream and registry timers stay real.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'finished-inbox-'));
  dir = path.join(root, 'project');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 1, id: 'project', name: 'Project' }));
  const config = { accountRoot: root, storeRoot: root, products: [], personalProducts: [] };
  store = await new Store(config).init();
  sup = new Supervisor(config, store, path.resolve('.'), root);
  item = { ...store.composeItem('project', { title: 'Check readiness', body: 'Check the release.' }), product: 'project' };
  vi.setSystemTime(Date.now() + 1000);
  session = { startedAt: Date.now(), result: 'The check is complete.', exitFailed: false };
  claim = await disk.claimWorkItem(dir, { id: item.id, holder: 'worker-a' });
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});
const read = () => store.readItem('project', item.id);
const beat = (held = claim, holder = 'worker-a') => disk.heartbeatWorkItem(dir, item.id, { epoch: held.epoch, holder });
const finish = () => {
  vi.setSystemTime(Date.now() + 1000);
  store.recordSessionResult('project', item.id, { result: session.result, status: null });
  sup.releaseFinishedClaim(item, session);
};

describe('finished agents return to the inbox', () => {
  it('releases the claim through the actual worker exit handler', async () => {
    disk.releaseWorkItem(dir, item.id, { epoch: claim.epoch });
    item = { ...read(), product: 'project' };
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    sup._folderFirst = () => false;
    sup.spawnPlan = () => ({ args: [] });
    sup.prepareClaudePermissions = () => {};
    sup.workFolderFor = () => dir;
    sup._spawnCodexWorker = () => child;
    sup._workerEnv = () => ({});
    sup.storeMcpCommand = () => '/fake/store';
    sup._saveState = () => {};
    sup.releaseWorkFolder = () => {};
    sup.spawnWorker(item, { engine: 'codex', profile: 'default', continuation: true });
    expect(sup.sessions.has(item.id)).toBe(true);
    claim = await disk.claimWorkItem(dir, { id: item.id, holder: 'worker-a' });
    vi.setSystemTime(Date.now() + 1000);
    child.emit('event', 'item/completed', { item: {
      type: 'agentMessage', phase: 'final_answer', text: 'The check is complete.',
    } });
    child.emit('exit', 0, null);
    expect(sup.sessions.has(item.id)).toBe(false);
    expect(read().result).toBe('The check is complete.');
    expect(read().claim).toBeNull();
    beat();
    expect(belongsInInbox(read())).toBe(true);
    expect(belongsInProgress(read())).toBe(false);
    // Let the diagnostic stream open and close before removing its directory.
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  it('returns an answered initial request without closing the conversation', () => {
    expect(belongsInProgress(read())).toBe(true);
    finish();
    expect(read().status).toBe('open');
    expect(read().claim).toBeNull();
    expect(belongsInInbox(read())).toBe(true);
    expect(belongsInProgress(read())).toBe(false);
    beat();
    expect(read().claim).toBeNull();
    expect(belongsInProgress(read())).toBe(false);
  });

  it('returns a completed reply, including same-worker claim renewals', async () => {
    store.answerItem('project', item.id, { answer: 'Proceed.' });
    const renewal = await disk.claimWorkItem(dir, { id: item.id, holder: 'worker-a' });
    finish();
    store.settleAnswer('project', item.id, read().wrote.answer.ts);
    beat(renewal);
    expect(read().claim).toBeNull();
    expect(belongsInInbox(read())).toBe(true);
    expect(belongsInProgress(read())).toBe(false);
  });

  it.each(['blocked', 'done'])('preserves an explicitly chosen %s status', status => {
    store.answerItem('project', item.id, { status });
    finish();
    beat();
    expect(read().status).toBe(status);
    expect(read().claim).toBeNull();
  });

  it('leaves live work and its heartbeat alone', () => {
    beat();
    expect(read().claim.holder).toBe('worker-a');
    expect(belongsInProgress(read())).toBe(true);
  });

  it.each([
    { exitFailed: true }, { claimRefused: true }, { result: null },
    { resultIsError: true }, { result: '  ' }, { stoppedByUs: true },
  ])('does not treat an unsuccessful or refused run as completed: %j', extra => {
    sup.releaseFinishedClaim(item, { ...session, ...extra });
    expect(read().claim.holder).toBe('worker-a');
  });

  it('cannot release a replacement worker or revive the old claim', async () => {
    disk.releaseWorkItem(dir, item.id, { epoch: claim.epoch });
    const next = await disk.claimWorkItem(dir, { id: item.id, holder: 'worker-b' });
    sup.releaseFinishedClaim(item, session);
    beat();
    expect(read().claim.holder).toBe('worker-b');
    expect(read().epoch).toBe(next.epoch);
    expect(belongsInProgress(read())).toBe(true);
  });

  it('does not release a claim acquired before this run started', () => {
    sup.releaseFinishedClaim(item, { ...session, startedAt: Date.now() + 1000 });
    expect(read().claim.holder).toBe('worker-a');
  });

  it('requires a real new claim after release, even from the same holder', async () => {
    disk.releaseWorkItem(dir, item.id, { epoch: claim.epoch });
    beat();
    expect(read().claim).toBeNull();
    const next = await disk.claimWorkItem(dir, { id: item.id, holder: 'worker-a' });
    beat(next);
    expect(read().epoch).toBe(claim.epoch + 1);
    expect(read().claim.holder).toBe('worker-a');
    expect(belongsInProgress(read())).toBe(true);
  });

  it('ignores a heartbeat with a different holder or an unclaimed future epoch', () => {
    beat(claim, 'worker-b');
    expect(read().claim.holder).toBe('worker-a');
    beat({ epoch: claim.epoch + 1 });
    expect(read().epoch).toBe(claim.epoch);
  });

  it('stops the tool server from renewing a claim released by completion', async () => {
    const previousAccount = process.env.STORE_ACCOUNT_ID;
    process.env.STORE_ACCOUNT_ID = 'test-account';
    const account = path.join(appHome(), 'accounts', 'test-account');
    fs.mkdirSync(account, { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    const work = await import('../mcp/core/work.mjs');
    const product = createProduct('Completed claims');
    const productDir = path.join(account, product.id);
    const row = work.createItem(product.id, { title: 'Check the build' });
    const registry = work.createClaimRegistry({ holder: 'tool-server', heartbeatMs: 60_000 });
    try {
      const held = await registry.claim({ id: row.id });
      registry._beat();
      expect(registry.holding()).toEqual([row.id]);
      disk.releaseWorkItem(productDir, row.id, { epoch: held.epoch });
      registry._beat();
      expect(registry.holding()).toEqual([]);
      expect(disk.readWorkItem(productDir, row.id).claim).toBeNull();
    } finally {
      registry._stop();
      if (previousAccount == null) delete process.env.STORE_ACCOUNT_ID;
      else process.env.STORE_ACCOUNT_ID = previousAccount;
    }
  });
});

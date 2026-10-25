// A THREAD RUNS IN THE CLOUD ONLY WHEN THIS MAC IS FULL, AND NOTHING SHIPS OR
// TIDIES A FOLDER WHOSE CLOUD WORK HAS NOT COME HOME.
//
// Cloud runs (docs/cloud/PLAN.md) exist because a 16 GB Mac runs two or three
// agents and every thread past that waits. The supervisor's part is small and
// every piece of it is a way to lose work or money if it is wrong:
//   - a run goes to the cloud only when there is no local slot, cloud runs are
//     on and set up, the cloud's own cap has room, and the row can run there
//     (Claude Code, its own task folder, not a personal project or a digest);
//   - a cloud run does not take one of this Mac's slots;
//   - a folder whose cloud run has not come home is "live" to the ship queue
//     (the worker adds `ship` BEFORE it exits, and shipping the stale branch
//     reports success), is not tidied away, and sends its next run through the
//     cloud proxy, which brings the earlier work home first;
//   - a restart that finds a cloud run's transcript missing waits for it to
//     come home instead of stranding the row.
// Measured against the supervisor itself, with the spawn replaced by a
// recorder; the run itself is tests/a-cloud-run-brings-the-agents-work-home.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Supervisor } from '../main/supervisor.mjs';
import { writeMarker, clearMarker } from '../main/cloud/marker.mjs';
import { taskFolderPath } from '../main/task-folders.mjs';

const ONE_ACCOUNT_HOME = '/nonexistent-home-with-no-second-account';
let tmp; let repo; let folder; let product; let sup;
const savedConfigEnv = process.env.AGENTBOX_CLOUD_CONFIG;

const build = ({ cloudRuns = true, slots = 2, maxCloudSessions = 10, personal = [], signedIn = true } = {}) => {
  sup = new Supervisor(
    { home: ONE_ACCOUNT_HOME, storeRoot: path.join(tmp, 'store'), maxConcurrentSessions: slots, authProfiles: ['default'], cloudRuns, maxCloudSessions, personalProducts: personal },
    { listItems: () => [], listProducts: () => [product], isDue: () => true, settleAnswer() {}, readItem: () => null },
    path.join(tmp, 'app'),
  );
  sup._homesAsked = [];
  sup._bringCloudHome = (f) => sup._homesAsked.push(f);
  // Whether an account has saved its cloud sign-in (the keychain, in the app).
  sup._hasCloudSignIn = () => signedIn;
  return sup;
};
let busy = 0;
const fill = (n, { cloud = false } = {}) => {
  for (let i = 0; i < n; i += 1) {
    busy += 1;
    const id = `w-busy-${cloud ? 'cloud' : 'local'}-${busy}`;
    sup.sessions.set(id, { itemId: id, product: 'p', engine: 'claude', cloud, child: { kill() {} }, tail: [] });
  }
};
const row = (id = 'w-1', extra = {}) => ({ id, product: 'p', status: 'open', labels: ['founder'], ...extra });

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudplace-')));
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['-c', 'user.email=a@e', '-c', 'user.name=a', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: repo });
  product = { slug: 'p', repoPath: repo, dir: path.join(tmp, 'store', 'p') };
  folder = taskFolderPath(repo, 'w-1');
  fs.mkdirSync(path.dirname(folder), { recursive: true });
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'agentbox/w-1', folder], { cwd: repo });
  const cfg = path.join(tmp, 'cloud.json');
  fs.writeFileSync(cfg, JSON.stringify({ region: 'us-east-1', bucket: 'b', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/x' }));
  process.env.AGENTBOX_CLOUD_CONFIG = cfg;
});
afterEach(() => {
  if (savedConfigEnv === undefined) delete process.env.AGENTBOX_CLOUD_CONFIG; else process.env.AGENTBOX_CLOUD_CONFIG = savedConfigEnv;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('where a thread runs', () => {
  it('runs on this Mac while it has a slot, even with cloud runs on', () => {
    build();
    fill(1);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('local');
  });

  it('goes to the cloud when this Mac is full', () => {
    build();
    fill(2);
    expect(sup._hasSlotFor('claude')).toBe(true);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('cloud');
  });

  it('waits, exactly as before, when cloud runs are off', () => {
    build({ cloudRuns: false });
    fill(2);
    expect(sup._hasSlotFor('claude')).toBe(false);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe(null);
  });

  it('waits when cloud runs are on but this Mac was never set up for them', () => {
    process.env.AGENTBOX_CLOUD_CONFIG = path.join(tmp, 'missing.json');
    build();
    fill(2);
    expect(sup._hasSlotFor('claude')).toBe(false);
  });

  it('is on by itself once this Mac is set up and signed in, with nothing in the config', () => {
    build({ cloudRuns: undefined });
    fill(2);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('cloud');
    build({ cloudRuns: null });
    fill(2);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('cloud');
  });

  it('offers no cloud slot when set up but no account has signed in for it', () => {
    build({ signedIn: false });
    fill(2);
    expect(sup._hasSlotFor('claude')).toBe(false);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe(null);
  });

  it('does not count a cloud run against this Mac\'s slots, and stops at the cloud\'s own cap', () => {
    build({ maxCloudSessions: 2 });
    fill(1, { cloud: true });
    fill(1);
    expect(sup._localSlotFor('claude')).toBe(true);
    fill(1, { cloud: false });
    expect(sup._localSlotFor('claude')).toBe(false);
    expect(sup._cloudSlotFor('claude')).toBe(true);
    sup.sessions.set('w-busy-cloud-9', { itemId: 'w-busy-cloud-9', engine: 'claude', cloud: true, tail: [] });
    expect(sup._cloudSlotFor('claude')).toBe(false);
  });

  it('sends a Codex row as well, once a Codex login can sign in there', () => {
    // Codex turned on in the app (its gate is the engine being on, not this
    // Mac's Codex logins: tests/the-cloud-keeps-working-while-this-macs-account-rests).
    const codexOn = () => { sup.engineChoices = () => [{ id: 'claude' }, { id: 'codex' }]; };
    build();
    fill(2);
    codexOn();
    expect(sup._cloudSlotFor('codex')).toBe(true);
    expect(sup._mayRunInCloud(row(), product, folder, {})).toBe(true);
    build({ signedIn: false });
    codexOn();
    expect(sup._cloudSlotFor('codex')).toBe(false);
    build();
    sup.engineChoices = () => [{ id: 'claude' }];
    expect(sup._cloudSlotFor('codex')).toBe(false);
  });

  it('never sends a personal project, a row with no task folder, or a digest', () => {
    build({ personal: ['mine'] });
    fill(2);
    expect(sup._whereToRun({ item: row(), product: { ...product, slug: 'mine' }, cwd: folder, engine: 'claude' })).toBe(null);
    expect(sup._whereToRun({ item: row(), product, cwd: repo, engine: 'claude' })).toBe(null);
    expect(sup._whereToRun({ item: row('digest-123'), product, cwd: folder, engine: 'claude' })).toBe(null);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude', remoteOnly: true })).toBe(null);
  });

  it('counts a cloud slot as room only for a row that can use it, so an Urgent personal row still asks for one here', () => {
    build({ personal: ['mine'] });
    product = { ...product };
    const products = [product, { slug: 'mine', repoPath: repo, dir: '/x' }];
    sup.store.listProducts = () => products;
    fill(2);
    expect(sup._hasSlotFor('claude', row())).toBe(true);
    expect(sup._hasSlotFor('claude', { ...row(), product: 'mine' })).toBe(false);
    expect(sup._hasSlotFor('claude', { ...row(), id: 'digest-1' })).toBe(false);
    expect(sup._hasSlotFor('claude', false)).toBe(false);
  });

  it('lets a pinned account that is full on this Mac overflow to the cloud, not onto a local slot', () => {
    build();
    fill(1);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude', localFull: true })).toBe('cloud');
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude', localFull: false })).toBe('local');
  });

  it('a reply the Mac has no slot for still runs, in the cloud when it can', () => {
    build();
    fill(2);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude', continuation: true })).toBe('cloud');
    build({ cloudRuns: false });
    fill(2);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude', continuation: true })).toBe('local');
  });
});

describe('a folder whose cloud work has not come home', () => {
  beforeEach(() => writeMarker(folder, { runId: 'r1', sessionId: 's', branch: 'agentbox/w-1', state: 'import-failed' }));
  afterEach(() => clearMarker(folder));

  it('runs nothing until the earlier work is home, then is placed like any other', () => {
    build();
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe(null);
    expect(sup._homesAsked).toEqual([folder]);
    clearMarker(folder);
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe('local');
  });

  it('with cloud runs off, runs nothing in it and asks for the work to come home', () => {
    build({ cloudRuns: false });
    expect(sup._whereToRun({ item: row(), product, cwd: folder, engine: 'claude' })).toBe(null);
    expect(sup._homesAsked).toEqual([folder]);
  });

  it('is live to the ship queue, so the stale branch is never shipped', () => {
    build();
    expect(sup.shipQueue.isLive(row())).toBe(true);
    clearMarker(folder);
    expect(sup.shipQueue.isLive(row())).toBe(false);
  });

  it('is not tidied away', async () => {
    build();
    expect(await sup.releaseWorkFolder(row(), product)).toBe(null);
    expect(fs.existsSync(folder)).toBe(true);
  });
});

describe('a cloud run whose row was finished or archived meanwhile', () => {
  it('still has its work brought home, and is not forgotten until it is', () => {
    build();
    writeMarker(folder, { runId: 'r1', sessionId: 's', branch: 'agentbox/w-1', state: 'import-failed' });
    sup._liveSessions = { 'w-1': { sessionId: 'sess-x', product: 'p', cwd: folder, profile: 'default', engine: 'claude', cloud: true } };
    sup.store.listItems = () => [row('w-1', { status: 'done' })];
    sup.recoverInterrupted('tick');
    expect(sup._homesAsked).toContain(folder);
    expect(sup._liveSessions['w-1']).toBeTruthy();
    clearMarker(folder);
    sup.recoverInterrupted('tick');
    expect(sup._liveSessions['w-1']).toBeUndefined();
  });
});

describe('a restart that cut a cloud run off', () => {
  it('waits for its transcript to come home instead of stranding the row', () => {
    build();
    writeMarker(folder, { runId: 'r1', sessionId: 's', branch: 'agentbox/w-1', state: 'running' });
    const rec = { sessionId: 'sess-1', product: 'p', cwd: folder, profile: 'default', engine: 'claude', cloud: true, startedAt: Date.now() };
    sup._liveSessions = { 'w-1': rec };
    sup.store.listItems = () => [row('w-1', { status: 'claimed' })];
    sup.store.readItem = () => row('w-1', { status: 'claimed' });
    // The transcript has not come home yet, and nothing really starts.
    sup.transcriptFile = () => null;
    const spawned = [];
    sup.spawnWorker = (item) => spawned.push(item.id);
    const out = sup.recoverInterrupted('startup');
    expect(out).toMatchObject({ queued: 1, waiting: 0, resumed: 0 });
    expect(sup._homesAsked).toContain(folder);
    expect(spawned).toEqual([]);
    // Once the work is home (marker gone, transcript here), the same pass
    // resumes it like any other interrupted run.
    clearMarker(folder);
    sup.transcriptFile = () => '/somewhere/sess-1.jsonl';
    const later = sup.recoverInterrupted('tick');
    expect(later.queued).toBe(0);
    expect(later.waiting).toBe(0);
  });
});

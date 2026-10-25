// A CLOUD RUN IS NEVER TOLD IT IS ON THE COMPUTER (w-4465054f04, 2026-10-22).
//
// In the cloud power test a new thread's cloud run handed back (it needed a
// repository the sandbox did not have) and the request ran again on this Mac
// as a fresh task. Only a reply's brief ever read the hand-back note, so the
// fresh run was not told it had moved and the note stayed waiting. The
// tester's next reply went to the cloud, and its brief opened with "This
// thread has just moved from the cloud to this computer ... This computer has
// the files": the agent searched the sandbox and answered that the folder did
// not exist on "this computer".
//
// The note now goes to the run that carries the request on this Mac, whatever
// brief that run gets, and is dropped once that run has carried it or the
// thread has been sent back to the cloud.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Supervisor } from '../main/supervisor.mjs';
import { HAND_BACK } from '../shared/cloud-hand-back.mjs';

const MOVED = /moved from the cloud to this computer/;
let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'told-it-moved-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const product = () => ({ slug: 'p', name: 'P', dir: path.join(tmp, 'p'), repoPath: path.join(tmp, 'p') });
const make = () => {
  fs.mkdirSync(product().dir, { recursive: true });
  const store = { listItems: () => [], listProducts: () => [product()], isDue: () => true };
  const sup = new Supervisor({ storeRoot: tmp, home: tmp, authProfiles: ['default'], maxConcurrentSessions: 3 }, store, tmp);
  sup._saveState = () => {};
  return sup;
};
const item = { id: 'w-a', product: 'p', title: 'Look at the Platform repo', body: 'In Platform.', status: 'open' };
const handedBack = () => ({ itemId: 'w-a', product: 'p', cloud: true, startedAt: Date.now() - 60_000, result: `${HAND_BACK} the Platform repository`, resultIsError: false });
const promptOf = (plan) => plan.args[plan.args.indexOf('-p') + 1];

describe('the run that carries the request on this Mac', () => {
  it('is told it moved, on a fresh task', () => {
    const sup = make();
    sup._noteCloudHandBack(item, handedBack());
    expect(promptOf(sup.spawnPlan(item, product(), { movedHere: true }))).toMatch(MOVED);
  });

  it('is told it moved, on a reply', () => {
    const sup = make();
    sup._noteCloudHandBack(item, handedBack());
    sup._rowSessions = { 'w-a': { sessionId: 's-1', product: 'p', cwd: product().dir, profile: 'default', startedAt: Date.now(), lastUsedAt: Date.now() } };
    sup.rowSessionFor = () => sup._rowSessions['w-a'];
    const prompt = promptOf(sup.spawnPlan({ ...item, answer: 'please do it' }, product(), { continuation: true, movedHere: true }));
    expect(prompt).toMatch(MOVED);
    expect(prompt).toContain('please do it');
  });

  it('is not told anything about moving when it was not handed back', () => {
    const sup = make();
    expect(promptOf(sup.spawnPlan(item, product(), {}))).not.toMatch(MOVED);
  });
});

describe('the note is for one run on this Mac', () => {
  it('is taken by a run starting here, once', () => {
    const sup = make();
    sup._noteCloudHandBack(item, handedBack());
    expect(sup._toldItMoved(item, 'local')).toBe(true);
    expect(sup._toldItMoved(item, 'local')).toBe(false);
  });

  it('is never given to a run in the cloud', () => {
    const sup = make();
    sup._noteCloudHandBack(item, handedBack());
    expect(sup._toldItMoved(item, 'cloud')).toBe(false);
    expect(sup._toldItMoved(item, 'cloud-wait')).toBe(false);
  });

  it('is dropped once the run here has carried the request', () => {
    const sup = make();
    sup._noteCloudHandBack(item, handedBack());
    sup._spendMoveToMac(item, { cloud: false, exitFailed: false });
    expect(sup._toldItMoved(item, 'local')).toBe(false);
  });

  it('is dropped when the thread is sent back to the cloud', () => {
    const sup = make();
    sup._noteCloudHandBack(item, handedBack());
    sup.setThreadOnMac({ 'w-a': null });
    expect(sup._toldItMoved(item, 'local')).toBe(false);
  });

  it('is not given to a reply that runs in the cloud after it was carried', () => {
    const sup = make();
    sup._noteCloudHandBack(item, handedBack());
    sup._spendMoveToMac(item, { cloud: false, exitFailed: false });
    expect(sup.replyBrief({ ...item, answer: 'next' })).not.toMatch(MOVED);
  });
});

describe('at the spawn', () => {
  const spawnAt = (where) => {
    const sup = make();
    sup._noteCloudHandBack(item, handedBack());
    const asked = [];
    sup._whereToRun = () => where;
    sup._folderFirst = () => false;
    sup._photoFirst = () => false;
    sup.workFolderFor = () => product().dir;
    sup.spawnPlan = (_i, _p, opts) => { asked.push(opts); return { args: [] }; };
    sup.prepareClaudePermissions = () => {};
    sup._workerEnv = () => ({});
    const child = new (class extends EventEmitter {})();
    child.stderr = new EventEmitter();
    child.stdout = new EventEmitter();
    sup._spawnClaude = () => child;
    sup._spawnCloudRelay = () => child;
    try { sup.spawnWorker(item, { engine: 'claude', profile: 'default' }); } catch { /* only the plan's options matter here */ }
    return asked[0] ?? null;
  };

  it('a run starting on this Mac is told', () => {
    expect(spawnAt('local')?.movedHere).toBe(true);
  });

  it('a run starting in the cloud is not', () => {
    expect(spawnAt('cloud')?.movedHere).toBe(false);
  });
});

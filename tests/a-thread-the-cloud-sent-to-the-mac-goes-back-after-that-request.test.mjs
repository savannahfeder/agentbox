// A THREAD THE CLOUD SENT TO THIS MAC GOES BACK TO THE CLOUD AFTER THAT REQUEST.
//
// What broke (2026-10-20): with the cloud set to Everything, three of the six
// threads in progress were running on the Mac. Each had once needed the Mac (a
// deploy with the Mac's AWS keys, a review by the Mac's Codex, a test of the
// desktop app). That hand-back, like three failed cloud starts, kept the thread
// on the Mac for good, for every later reply, whatever that reply asked. Read
// off the code: `_noteCloudHandBack` and `_cloudKeptOnMac` wrote the same
// permanent flag as the thread menu's "Keep on this Mac", so the app's own move
// and the person's choice could not be told apart, even after a restart.
//
// Now the app's move lasts for the request that needed the Mac. Once a run
// here has carried it to an answer, the next reply goes to the cloud first
// again. The person's own "Keep on this Mac" stays for good.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { HAND_BACK } from '../shared/cloud-hand-back.mjs';
import { KEEP_ON_MAC, IMPORT_FAILED } from '../main/cloud/run.mjs';

const product = { slug: 'p', dir: '', repoPath: '/r' };
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-to-mac-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const make = (root) => {
  product.dir = root;
  const store = { listItems: () => [], listProducts: () => [product], isDue: () => true };
  return new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3 }, store, root);
};

const item = { id: 'w-a', product: 'p' };
const mayGoToTheCloud = (sup) => sup._cloudEligible(item) && sup._mayRunInCloud(item, product, '/r/.claude/worktrees/w-a');
const handedBack = () => ({ itemId: 'w-a', product: 'p', cloud: true, startedAt: Date.now() - 60_000, sessionId: 's1', result: `${HAND_BACK} the AWS keys`, resultIsError: false });
const deadCloudStart = () => ({ itemId: 'w-a', product: 'p', cloud: true, tail: [], sessionId: null, result: null });
// A run on this Mac that carried the request to its answer; `exitFailed` is
// what the exit handler has worked out by the time it asks.
const answeredHere = (extra = {}) => ({ itemId: 'w-a', product: 'p', cloud: false, sessionId: 's2', result: 'Deployed.', exitFailed: false, ...extra });

describe('a thread the cloud handed back', () => {
  it('runs that request on this Mac, then may go to the cloud again', () => {
    const sup = make(tmp());
    expect(sup._noteCloudHandBack(item, handedBack())).toBe(true);
    expect(mayGoToTheCloud(sup)).toBe(false);
    sup._spendMoveToMac(item, answeredHere());
    expect(mayGoToTheCloud(sup)).toBe(true);
  });

  it('stays on this Mac while no run here has carried the request', () => {
    const sup = make(tmp());
    sup._noteCloudHandBack(item, handedBack());
    // Failed, cut off by a quit or a Stop, or never started: the retry runs here.
    sup._spendMoveToMac(item, answeredHere({ result: null, exitFailed: true }));
    sup._spendMoveToMac(item, answeredHere({ exitFailed: true }));
    sup._spendMoveToMac(item, answeredHere({ sessionId: null, result: null, exitFailed: true }));
    expect(mayGoToTheCloud(sup)).toBe(false);
  });

  it('is not spent by a run in the cloud', () => {
    const sup = make(tmp());
    sup._noteCloudHandBack(item, handedBack());
    sup._spendMoveToMac(item, answeredHere({ cloud: true }));
    expect(mayGoToTheCloud(sup)).toBe(false);
  });

  it('is not the person\'s keep, so the thread\'s menu still offers to keep it here', () => {
    const sup = make(tmp());
    sup._noteCloudHandBack(item, handedBack());
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a' }]);
  });

  it('survives a restart until a run here carries the request', () => {
    const root = tmp();
    make(root)._noteCloudHandBack(item, handedBack());
    const after = make(root);
    expect(mayGoToTheCloud(after)).toBe(false);
    after._spendMoveToMac(item, answeredHere());
    expect(mayGoToTheCloud(make(root))).toBe(true);
  });
});

describe('a thread the cloud could not start', () => {
  it('runs that request here when its folder could not go, then may go to the cloud again', () => {
    const sup = make(tmp());
    expect(sup._cloudKeptOnMac(item, deadCloudStart(), KEEP_ON_MAC)).toBe(true);
    expect(mayGoToTheCloud(sup)).toBe(false);
    sup._spendMoveToMac(item, answeredHere());
    expect(mayGoToTheCloud(sup)).toBe(true);
  });

  it('runs that request here after three dead starts, then may go to the cloud again', () => {
    const sup = make(tmp());
    sup._cloudKeptOnMac(item, deadCloudStart(), IMPORT_FAILED);
    sup._cloudKeptOnMac(item, deadCloudStart(), IMPORT_FAILED);
    expect(mayGoToTheCloud(sup)).toBe(true);
    expect(sup._cloudKeptOnMac(item, deadCloudStart(), IMPORT_FAILED)).toBe(true);
    expect(mayGoToTheCloud(sup)).toBe(false);
    sup._spendMoveToMac(item, answeredHere());
    expect(mayGoToTheCloud(sup)).toBe(true);
  });
});

describe('the person\'s own keep, from the thread\'s menu', () => {
  it('stays for good, however many runs here finish', () => {
    const sup = make(tmp());
    sup.setThreadOnMac({ 'w-a': true });
    sup._spendMoveToMac(item, answeredHere());
    sup._spendMoveToMac(item, answeredHere());
    expect(mayGoToTheCloud(sup)).toBe(false);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a', onMac: true }]);
  });

  it('lasts a restart as the person\'s, not as a move', () => {
    const root = tmp();
    make(root).setThreadOnMac({ 'w-a': true });
    const after = make(root);
    after._spendMoveToMac(item, answeredHere());
    expect(mayGoToTheCloud(after)).toBe(false);
  });

  it('"Run on the cloud" lets a thread the app moved go at once', () => {
    const sup = make(tmp());
    sup._noteCloudHandBack(item, handedBack());
    sup.setThreadOnMac({ 'w-a': null });
    expect(mayGoToTheCloud(sup)).toBe(true);
  });
});

describe('a Mac whose kept threads were saved before this change', () => {
  // Then the app's moves and the person's keeps were one flag. Nearly all were
  // moves, and the price of reading a keep as a move is one try in the cloud.
  it('reads them as moves: one more request here, then the cloud', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, '.zero-supervisor.json'), JSON.stringify({ threadOnMac: { 'w-a': true } }));
    const sup = make(root);
    expect(mayGoToTheCloud(sup)).toBe(false);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a' }]);
    sup._spendMoveToMac(item, answeredHere());
    expect(mayGoToTheCloud(sup)).toBe(true);
  });
});

describe('a supervisor built without its saved state', () => {
  // tests/what-one-reply-may-do builds one bare, and its runs' ends threw here.
  it('ends a run, moves a thread and takes the menu\'s choice without throwing', () => {
    const bare = Object.create(Supervisor.prototype);
    bare._saveState = () => {};
    bare.threadOnMac = {};
    bare.sessions = new Map();
    expect(() => bare._spendMoveToMac(item, answeredHere())).not.toThrow();
    expect(() => bare.setThreadOnMac({ 'w-a': null })).not.toThrow();
    bare._moveToMac('w-a');
    expect('w-a' in bare.movedToMac).toBe(true);
  });
});

describe('the plumbing', () => {
  it('spends the move where every run ends, after the run is judged', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    const spend = src.indexOf('this._spendMoveToMac(item, session)');
    expect(spend).toBeGreaterThan(src.indexOf('session.exitFailed = !!('));
    expect(spend).toBeGreaterThan(src.indexOf('this._cloudKeptOnMac(item, session, code, signal)'));
  });
});

// A THREAD THE CLOUD KEEPS HANDING BACK STOPS BEING SENT THERE.
//
// Found in the 3-hour cloud test, 2026-10-22. A thread filed under the wrong
// project needs a repository the cloud copy does not have, so every reply went
// to the cloud, the cloud handed it straight back, and the run happened here —
// because the app's own move to this Mac lasts one request (w-324e3db9d7,
// 2026-10-20, and the test beside this one holds that rule). Each reply cost a
// cloud start that could never do anything: measured on one thread, four round
// trips in an hour.
//
// A hand-back is not evidence on its own: the usual one is a thread that needed
// this Mac's keys or its Codex for THAT request and can go back afterwards. Two
// in a row is evidence. So the second one keeps the thread here, says so, and
// shows on the row as "This Mac only", which is one press to undo.
//
// What must not break: one hand-back still lasts a single request, and the
// person's own choice either way is still the last word.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { HAND_BACK } from '../shared/cloud-hand-back.mjs';

const product = { slug: 'p', dir: '', repoPath: '/r' };
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'handed-back-twice-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const make = (root) => {
  product.dir = root;
  const store = { listItems: () => [], listProducts: () => [product], isDue: () => true };
  return new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3 }, store, root);
};

const item = { id: 'w-a', product: 'p' };
const mayGoToTheCloud = (sup) => sup._cloudEligible(item) && sup._mayRunInCloud(item, product, '/r/.claude/worktrees/w-a');
const handedBack = () => ({ itemId: 'w-a', product: 'p', cloud: true, startedAt: Date.now() - 60_000, sessionId: 's1', result: `${HAND_BACK} this project has no repository here`, resultIsError: false });
const answeredHere = () => ({ itemId: 'w-a', product: 'p', cloud: false, sessionId: 's2', result: 'Done.', exitFailed: false });
// One whole round trip: the cloud hands it back, a run here carries the reply.
const roundTrip = (sup) => { sup._noteCloudHandBack(item, handedBack()); sup._spendMoveToMac(item, answeredHere()); };

describe('the second hand-back', () => {
  it('keeps the thread on this Mac, so no later reply pays for a cloud start', () => {
    const sup = make(tmp());
    roundTrip(sup);
    expect(mayGoToTheCloud(sup)).toBe(true);
    roundTrip(sup);
    expect(mayGoToTheCloud(sup)).toBe(false);
    sup._spendMoveToMac(item, answeredHere());
    expect(mayGoToTheCloud(sup)).toBe(false);
  });

  // Since 2026-10-29 the row also carries what the cloud needed, for the
  // thread's cloud button (the-cloud-button-on-a-thread-says-...).
  it('shows on the row as kept here, which is one press to undo', () => {
    const sup = make(tmp());
    roundTrip(sup);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a' }]);
    roundTrip(sup);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a', onMac: true, needsMac: 'this project has no repository here' }]);
  });

  it('lasts a restart', () => {
    const root = tmp();
    const sup = make(root);
    roundTrip(sup);
    roundTrip(sup);
    expect(mayGoToTheCloud(make(root))).toBe(false);
  });

  it('is counted per thread', () => {
    const sup = make(tmp());
    roundTrip(sup);
    const other = { id: 'w-b', product: 'p' };
    sup._noteCloudHandBack(other, { ...handedBack(), itemId: 'w-b' });
    sup._spendMoveToMac(other, { ...answeredHere(), itemId: 'w-b' });
    expect(sup._cloudEligible(other)).toBe(true);
  });

  it('says so where the run is told what happened', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/handed this thread back twice/);
  });
});

describe('the person is still the last word', () => {
  it('"Run on the cloud" sends it back at once, and the count starts again', () => {
    const sup = make(tmp());
    roundTrip(sup);
    roundTrip(sup);
    sup.setThreadOnMac({ 'w-a': null });
    expect(mayGoToTheCloud(sup)).toBe(true);
    roundTrip(sup);
    expect(mayGoToTheCloud(sup)).toBe(true);
  });

  it('"Keep on this Mac" is their own, not the app\'s count', () => {
    const sup = make(tmp());
    roundTrip(sup);
    sup.setThreadOnMac({ 'w-a': true });
    expect(mayGoToTheCloud(sup)).toBe(false);
    sup.setThreadOnMac({ 'w-a': null });
    expect(mayGoToTheCloud(sup)).toBe(true);
  });
});

describe('a supervisor built without its saved state', () => {
  it('counts a hand-back without throwing', () => {
    const bare = Object.create(Supervisor.prototype);
    bare._saveState = () => {};
    bare.threadOnMac = {};
    bare.sessions = new Map();
    expect(() => bare._noteCloudHandBack(item, handedBack())).not.toThrow();
  });
});

// A THREAD THE CLOUD HANDS BACK GOES BACK TO THE CLOUD ONCE THAT REQUEST IS DONE.
//
// 2026-10-29, with the cloud on Everything, most threads read "Working
// locally". Measured on the person's own Mac over 24 hours: 165 runs here
// (21.7 agent-hours) against 180 in the cloud (17.1 h). 92 of those 165 runs
// (11.9 h) were threads the app had locked to the Mac because the cloud had
// handed them back twice; 34 threads were locked that way, for good, since
// the count was a lifetime total that nothing reset.
//
// A hand-back says one request needed the Mac (a key, a sign-in, the person's
// screen), not that the next one will. A bounce, the cloud starting and
// handing back, cost a median 19 s of cloud time (23 in the same 24 hours).
// So, agreed with Codex: no automatic keep at all. Each hand-back moves that
// one request here, and the next reply goes to the cloud first. A move whose
// run here never finished runs out after six hours. Only the person's own
// "Keep on this Mac" lasts.
import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { HAND_BACK } from '../shared/cloud-hand-back.mjs';

const HOUR = 60 * 60_000;
const product = { slug: 'p', dir: '', repoPath: '/r' };
const dirs = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hand-backs-')); dirs.push(d); return d; };
afterEach(() => {
  vi.restoreAllMocks();
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
});
const make = (root) => {
  product.dir = root;
  const store = { listItems: () => [], listProducts: () => [product], isDue: () => true };
  return new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3 }, store, root);
};
let clock = Date.parse('2026-10-29T12:00:00Z');
const at = (ms) => { clock = ms; vi.spyOn(Date, 'now').mockImplementation(() => clock); };
const later = (ms) => at(clock + ms);

const item = { id: 'w-a', product: 'p' };
const mayGoToTheCloud = (sup) => sup._cloudEligible(item) && sup._mayRunInCloud(item, product, '/r/.claude/worktrees/w-a');
const handedBack = () => ({ itemId: 'w-a', product: 'p', cloud: true, sessionId: 's1', result: `${HAND_BACK} your Stripe key`, resultIsError: false });
const answeredHere = () => ({ itemId: 'w-a', product: 'p', cloud: false, sessionId: 's2', result: 'Done.', exitFailed: false });
const stoppedHere = () => ({ itemId: 'w-a', product: 'p', cloud: false, sessionId: 's2', result: null, exitFailed: true });
// How a run's end reaches these marks, in the order settleExit asks.
const ends = (sup, session) => {
  sup._noteCloudHandBack(item, session);
  sup._spendMoveToMac(item, session);
};

describe('every hand-back moves one request, however many came before', () => {
  it('a thread handed back twice in a row goes to the cloud for its next reply (the reported case)', () => {
    at(clock);
    const sup = make(tmp());
    for (let n = 0; n < 2; n += 1) { ends(sup, handedBack()); ends(sup, answeredHere()); }
    expect(mayGoToTheCloud(sup)).toBe(true);
  });

  it('and so does one handed back five times', () => {
    at(clock);
    const sup = make(tmp());
    for (let n = 0; n < 5; n += 1) { ends(sup, handedBack()); ends(sup, answeredHere()); }
    expect(mayGoToTheCloud(sup)).toBe(true);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a' }]);
  });

  it('the request that was handed back still runs here, and the row says what it needed', () => {
    at(clock);
    const sup = make(tmp());
    ends(sup, handedBack());
    expect(mayGoToTheCloud(sup)).toBe(false);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a', needsMac: 'your Stripe key' }]);
  });

  it('the run here says it goes back afterwards, never that it stays', () => {
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/handed this thread back twice/);
    expect(src).not.toMatch(/cloudHandBacks/);
  });
});

describe('what an older copy of the app saved', () => {
  it('a thread it locked here goes back to the cloud on the first start', () => {
    at(clock);
    const root = tmp();
    fs.writeFileSync(path.join(root, '.zero-supervisor.json'), JSON.stringify({
      movedToMac: { 'w-a': clock - 3 * 24 * HOUR },
      cloudHandBacks: { 'w-a': 2 },
    }));
    expect(mayGoToTheCloud(make(root))).toBe(true);
  });

  it('a request moved here an hour ago still runs here after a restart', () => {
    at(clock);
    const root = tmp();
    ends(make(root), handedBack());
    later(HOUR);
    expect(mayGoToTheCloud(make(root))).toBe(false);
  });
});

describe('a move whose run here never finished runs out', () => {
  it('counts its six hours from the last run here that took the request up, so a restart mid-run keeps it here', () => {
    at(clock);
    const root = tmp();
    const sup = make(root);
    ends(sup, handedBack());
    later(5 * HOUR);
    sup._noteCarryingHandBack(item.id);
    later(2 * HOUR);
    expect(mayGoToTheCloud(make(root))).toBe(false);
  });

  it('a time saved in the future keeps nothing here', () => {
    at(clock);
    const root = tmp();
    fs.writeFileSync(path.join(root, '.zero-supervisor.json'), JSON.stringify({ movedToMac: { 'w-a': clock + 24 * HOUR } }));
    expect(mayGoToTheCloud(make(root))).toBe(true);
  });

  it('holds the next reply here for six hours, and not a minute longer', () => {
    at(clock);
    const sup = make(tmp());
    ends(sup, handedBack());
    ends(sup, stoppedHere());
    later(6 * HOUR - 60_000);
    expect(mayGoToTheCloud(sup)).toBe(false);
    later(60_000);
    expect(mayGoToTheCloud(sup)).toBe(true);
  });
});

describe('the sweep that moves runs on this Mac up to the cloud', () => {
  const cloudOn = (sup) => {
    sup.config.cloudRuns = 'all';
    sup._cloudSetUp = () => true;
    sup._cloudReady = () => true;
    sup._cloudSignedInAtAll = () => true;
    sup._liveSessions['w-a'] = { product: 'p', sessionId: 's2', cwd: '/r/.claude/worktrees/w-a', engine: 'claude' };
    sup.transcriptFile = () => '/t.jsonl';
  };
  const running = (extra = {}) => ({ itemId: 'w-a', product: 'p', cwd: '/r/.claude/worktrees/w-a', engine: 'claude', startedAt: Date.now(), child: { kill() {} }, ...extra });

  it('leaves a run carrying a handed-back request alone, even past six hours', () => {
    at(clock);
    const sup = make(tmp());
    cloudOn(sup);
    ends(sup, handedBack());
    const s = running({ carriesHandBack: true });
    sup.sessions.set('w-a', s);
    later(7 * HOUR);
    expect(sup._movableToCloud(s, item)).toBe(false);
  });

  it('moves a run here that carries no handed-back request, though an old unspent move is lying there', () => {
    at(clock);
    const sup = make(tmp());
    cloudOn(sup);
    ends(sup, handedBack());
    ends(sup, stoppedHere());
    later(7 * HOUR);
    const s = running();
    sup.sessions.set('w-a', s);
    expect(sup._movableToCloud(s, item)).toBe(true);
  });
});

describe("the person's own choice does not run out", () => {
  it('"Keep on this Mac" holds for good', () => {
    at(clock);
    const sup = make(tmp());
    sup.setThreadOnMac({ 'w-a': true });
    later(30 * 24 * HOUR);
    expect(mayGoToTheCloud(sup)).toBe(false);
    expect(sup.withPlaces([{ id: 'w-a' }])).toEqual([{ id: 'w-a', onMac: true }]);
  });
});

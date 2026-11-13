// WITH EVERYTHING ON, A THREAD WAITS FOR THE CLOUD, NOT THIS MAC.
//
// What broke (2026-10-16, her Mac overloaded with cloud runs set to
// Everything): read off the code on 2026-10-17, `_whereToRun` sent a thread to
// this Mac whenever the cloud had no slot and this Mac had one: past the
// cloud's cap of 10 live runs, and whenever every cloud account was at its
// usage limit (that second case runs here again since 2026-10-26). She: "the whole premise is that it opens up more agent slots so
// theoretically you could run 50 or 100 agents at once".
//
// Now, with Everything, a thread that may go to the cloud waits for a cloud
// slot. Only a thread that cannot go there by its nature (kept on this Mac, no
// task folder, a digest) or an engine with no cloud sign-in at all runs here.
// The cloud's cap is 20: each cloud run still costs this Mac about 120 MB
// (its relay and tool servers), so the cap rises as that comes down.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { DEFAULTS } from '../main/config.mts';
import { cloudFootLine } from '../renderer/src/cloud-menu.ts';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
function make({ cloudRuns = 'all', runnable = true, signedIn = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-everything-'));
  dirs.push(root);
  const product = { slug: 'p', dir: root, repoPath: '/r' };
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns },
    { listItems: () => [], listProducts: () => [product], isDue: () => true },
    root,
  );
  sup._cloudReady = () => runnable;
  sup._cloudSignedInAtAll = () => signedIn;
  return { sup, product };
}
const live = (sup, n) => { for (let i = 0; i < n; i += 1) sup.sessions.set(`w-live${i}`, { itemId: `w-live${i}`, engine: 'claude', cloud: true, sessionId: `s${i}`, child: { kill() {} }, tail: [] }); };
const item = { id: 'w-next', product: 'p' };
const cwd = '/r/.claude/worktrees/w-next';

describe('with Everything on', () => {
  it('the cloud takes twenty at once by default where each run needs a relay of its own', () => {
    expect(DEFAULTS.maxCloudSessions).toBe(null);
    const { sup, product } = make();
    expect(sup._maxCloud()).toBe(20);
    live(sup, 19);
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('cloud');
  });

  it('a thread finding the cloud full waits its turn, though this Mac has room', () => {
    const { sup, product } = make();
    live(sup, 20);
    expect(sup._localSlotFor('claude')).toBe(true);
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('cloud-wait');
    expect(sup._roomFor('claude', item)).toBe(false);
  });

  // Since 2026-10-26 a cloud account at its limit sends threads here instead
  // (with-the-clouds-account-at-its-limit-threads-run-on-this-mac.test.mts).
  it('a thread runs here while the cloud\'s account is at its limit', () => {
    const { sup, product } = make({ runnable: false });
    sup._cloudInUseState = () => 'limited';
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('local');
    expect(sup._roomFor('claude', item)).toBe(true);
  });

  it('a reply to such a thread waits too', () => {
    const { sup, product } = make();
    live(sup, 20);
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude', continuation: true })).toBe('cloud-wait');
  });

  it('a thread that cannot go to the cloud still runs here', () => {
    const { sup, product } = make();
    live(sup, 20);
    sup.threadOnMac['w-next'] = true;
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('local');
    delete sup.threadOnMac['w-next'];
    expect(sup._whereToRun({ item: { id: 'digest-1', product: 'p' }, product, cwd, engine: 'claude' })).toBe('local');
    expect(sup._whereToRun({ item, product: { ...product, repoPath: null }, cwd, engine: 'claude' })).toBe('local');
  });

  // Since w-4465054f04 only a thread this Mac's app-server has open stays here;
  // any other Codex reply goes up with its rollout and waits like any run.
  it('a Codex reply to a thread this Mac has open never waits for the cloud (Codex\'s review of the diff, finding 5)', () => {
    const { sup } = make({ runnable: false });
    sup.engineChoices = () => [{ id: 'claude' }, { id: 'codex' }];
    sup.rowSessionFor = () => ({ sessionId: 'thread-1' });
    const reply = { id: 'w-next', product: 'p', answer: 'yes' };
    sup._codexServers = new Map([['/codex-home', { client: { isClosed: () => false }, home: '/codex-home', loaded: new Set(['thread-1']) }]]);
    expect(sup._waitsForCloud(reply, 'codex')).toBe(false);
    sup._codexServers.get('/codex-home').loaded.clear();
    expect(sup._waitsForCloud(reply, 'codex')).toBe(true);
    sup.rowSessionFor = () => null;
    expect(sup._waitsForCloud(reply, 'codex')).toBe(true);
  });

  // A power tester on the Free plan's 2 agents, 2026-11-09: a third thread said
  // "Runs on Cloud · Queued", then WORKING LOCALLY, five times in 1.7 hours.
  // The app's own cap is 20, so it sent the run, the server refused it for the
  // plan's agents, and that refusal made the cloud read as unusable for half a
  // minute, which sent the thread here.
  const turnedAway = (sup) => { sup._cloudNoRoom = { error: 'agents', message: 'Both of your cloud agents are running.', until: Date.now() + 30_000 }; };

  it('a thread the plan\'s cloud agents turned away waits for one of ours to finish, though this Mac has room', () => {
    const { sup, product } = make();
    live(sup, 2);
    turnedAway(sup);
    expect(sup._localSlotFor('claude')).toBe(true);
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('cloud-wait');
    expect(sup._whyWaitingForCloud('claude').why).toBe('cloud-full');
  });

  it('with none of ours in the cloud, slots taken elsewhere send it here as before, so it never waits on what it cannot see end', () => {
    const { sup, product } = make();
    turnedAway(sup);
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('local');
  });

  it('turned away, it frees the oldest cloud run that has answered and only waits for a reply', () => {
    const { sup } = make();
    const stopped = [];
    for (const [id, at, between] of [['w-a', 1, true], ['w-b', 2, true], ['w-c', 0, false]]) {
      sup.sessions.set(id, { itemId: id, engine: 'claude', cloud: true, between, startedAt: at, child: { kill() {}, stopWaiting: () => stopped.push(id) }, tail: [] });
    }
    sup._noteCloudNoRoom({ cloud: true, tail: ['stderr: agentbox cloud: no room in the cloud (agents): Both are running.'] }, 79);
    expect(stopped).toEqual(['w-a']);
    stopped.length = 0;
    sup._noteCloudNoRoom({ cloud: true, tail: ['stderr: agentbox cloud: no room in the cloud (hours): No hours left.'] }, 79);
    expect(stopped).toEqual([]);
  });

  const turnedAwayEightTimes = (sup) => {
    const row = { id: 'w-next', product: 'p' };
    for (let i = 0; i < 8; i += 1) {
      const s = { itemId: 'w-next', engine: 'claude', cloud: true, startedAt: Date.now(), tail: ['stderr: agentbox cloud: no room in the cloud (agents): Both are running.'] };
      sup.sessions.set('w-next', s);
      sup._noteCloudNoRoom(s, 79);
      sup._noteHowTheRunStarted(row, s);
      sup.sessions.delete('w-next');
    }
    return sup._heldStarts?.['p:w-next'];
  };

  it('a start turned away while our own cloud runs fill the plan is not a run that died, so waiting never holds the thread', () => {
    const { sup } = make();
    live(sup, 2);
    expect(turnedAwayEightTimes(sup)).toBeUndefined();
  });

  it('turned away over and over with none of ours in the cloud, the thread is still held and said', () => {
    const { sup } = make();
    expect(turnedAwayEightTimes(sup)).toBeTruthy();
  });

  it('out of hours or with no plan, a thread still runs here', () => {
    for (const error of ['hours', 'plan', 'paused']) {
      const { sup, product } = make();
      sup._cloudNoRoom = { error, message: null, until: Date.now() + 300_000 };
      expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('local');
    }
  });

  it('an engine with no cloud sign-in at all runs here, as before', () => {
    const { sup, product } = make({ runnable: false, signedIn: false });
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('local');
  });
});

describe('with "when this Mac is full"', () => {
  it('this Mac comes first, and the cloud takes the overflow', () => {
    const { sup, product } = make({ cloudRuns: null });
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('local');
  });

  it('a thread the cloud agents turned away runs here', () => {
    const { sup, product } = make({ cloudRuns: null });
    sup._cloudNoRoom = { error: 'agents', message: null, until: Date.now() + 30_000 };
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('local');
  });
});

describe('the cloud menu', () => {
  const at = Date.UTC(2026, 9, 17, 20, 0);
  const cloud = (mode) => ({ setUp: true, mode, running: 0, accounts: [{ engine: 'claude', key: 'a', ready: false, state: 'limited', limitedUntil: at + 2 * 3600_000, inUse: true }] });
  it('says threads run here until the reset, with Everything as with "when this Mac is full"', () => {
    expect(cloudFootLine(cloud('all'), at)).toMatch(/Threads run on this Mac until then\.$/);
    expect(cloudFootLine(cloud('full'), at)).toMatch(/Threads run on this Mac until then\.$/);
  });
});

describe('signed in to the cloud at all', () => {
  it('counts an account resting at its limit or renewing its Codex sign-in, not one that must sign in again (Codex\'s review of the diff, finding 6)', async () => {
    const { cloudLoginState } = await import('../main/cloud/logins.mts');
    const now = Date.now();
    expect(cloudLoginState({ id: 'a', engine: 'codex', expiresAt: now + 60_000 }, { now })).toBe('renew');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-signed-'));
    dirs.push(root);
    const sup = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'], cloudRuns: 'all' }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
    const src = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    expect(src).toMatch(/mayRunOn\(state\) \|\| state === 'limited' \|\| state === 'renew'/);
    expect(typeof sup._cloudSignedInAtAll).toBe('function');
  });
});

// 2026-10-17, later: with every run's relay in one shared host (main/cloud/host.mts),
// a run costs this Mac about 11 MB instead of about 110 (measured, 50 runs).
describe('the cloud\'s cap', () => {
  it('is two hundred through the shared host, twenty without it, and hers when she sets one', () => {
    const { sup } = make();
    sup._cloudHostAvailable = () => true;
    expect(sup._maxCloud()).toBe(200);
    sup._cloudHostAvailable = () => false;
    expect(sup._maxCloud()).toBe(20);
    sup.config.maxCloudSessions = 80;
    expect(sup._maxCloud()).toBe(80);
    sup.config.maxCloudSessions = 0;
    expect(sup._maxCloud()).toBe(0);
  });
});

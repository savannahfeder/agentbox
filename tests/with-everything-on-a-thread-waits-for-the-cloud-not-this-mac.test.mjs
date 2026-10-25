// WITH EVERYTHING ON, A THREAD WAITS FOR THE CLOUD, NOT THIS MAC.
//
// What broke (2026-10-16, her Mac overloaded with cloud runs set to
// Everything): read off the code on 2026-10-17, `_whereToRun` sent a thread to
// this Mac whenever the cloud had no slot and this Mac had one: past the
// cloud's cap of 10 live runs, and whenever every cloud account was at its
// usage limit. She: "the whole premise is that it opens up more agent slots so
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
import { Supervisor } from '../main/supervisor.mjs';
import { DEFAULTS } from '../main/config.mjs';
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

  it('a thread waits while every cloud account is at its limit, rather than running here', () => {
    const { sup, product } = make({ runnable: false });
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('cloud-wait');
    expect(sup._roomFor('claude', item)).toBe(false);
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
});

describe('the cloud menu', () => {
  const at = Date.UTC(2026, 9, 17, 20, 0);
  const cloud = (mode) => ({ setUp: true, mode, running: 0, accounts: [{ engine: 'claude', key: 'a', ready: false, state: 'limited', limitedUntil: at + 2 * 3600_000, inUse: true }] });
  it('says threads wait for the cloud with Everything, and run here with "when this Mac is full"', () => {
    expect(cloudFootLine(cloud('all'), at)).toMatch(/Threads wait for the cloud until then\.$/);
    expect(cloudFootLine(cloud('full'), at)).toMatch(/Threads run on this Mac until then\.$/);
  });
});

describe('signed in to the cloud at all', () => {
  it('counts an account resting at its limit or renewing its Codex sign-in, not one that must sign in again (Codex\'s review of the diff, finding 6)', async () => {
    const { cloudLoginState } = await import('../main/cloud/logins.mjs');
    const now = Date.now();
    expect(cloudLoginState({ id: 'a', engine: 'codex', expiresAt: now + 60_000 }, { now })).toBe('renew');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-signed-'));
    dirs.push(root);
    const sup = new Supervisor({ storeRoot: root, home: root, authProfiles: ['default'], cloudRuns: 'all' }, { listItems: () => [], listProducts: () => [], isDue: () => true }, root);
    const src = fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/mayRunOn\(state\) \|\| state === 'limited' \|\| state === 'renew'/);
    expect(typeof sup._cloudSignedInAtAll).toBe('function');
  });
});

// 2026-10-17, later: with every run's relay in one shared host (main/cloud/host.mjs),
// a run costs this Mac about 11 MB instead of about 110 (measured, 50 runs).
describe('the cloud\'s cap', () => {
  it('is fifty through the shared host, twenty without it, and hers when she sets one', () => {
    const { sup } = make();
    sup._cloudHostAvailable = () => true;
    expect(sup._maxCloud()).toBe(50);
    sup._cloudHostAvailable = () => false;
    expect(sup._maxCloud()).toBe(20);
    sup.config.maxCloudSessions = 80;
    expect(sup._maxCloud()).toBe(80);
    sup.config.maxCloudSessions = 0;
    expect(sup._maxCloud()).toBe(0);
  });
});

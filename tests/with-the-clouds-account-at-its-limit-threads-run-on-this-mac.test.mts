// WITH THE CLOUD'S ACCOUNT AT ITS LIMIT, THREADS RUN ON THIS MAC.
//
// What broke (2026-10-26): with the cloud set to Everything, the one Claude
// account the cloud runs on hit its usage limit at about 4:40pm, resetting at
// 5:35pm. She switched this Mac to another account and pressed Resume All
// Agents, and nothing started: six threads, her new ones included, sat
// "Queued" for the cloud while this Mac had two free slots and a working
// account. The account she switched to is not signed in to the cloud, so the
// switch moved nothing there. Read off the app's saved state that evening:
// ~/.agentbox/cloud-logins.json had one usable Claude login, limitedUntil
// 5:35pm, and `_waitsForCloud` held every thread for it.
//
// Now a cloud whose account is at its limit is not a slot worth waiting for:
// threads run here, within this Mac's own cap. A cloud that is merely full, or
// starting two runs, is still waited for (2026-10-17's rule, which kept her Mac
// from being loaded with the cloud's overflow).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { cloudFootLine } from '../renderer/src/cloud-menu.ts';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });

function make({ inUse = 'limited' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-at-limit-'));
  dirs.push(root);
  const product = { slug: 'p', dir: root, repoPath: '/r' };
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 2, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [product], isDue: () => true },
    root,
  );
  sup._cloudUsable = () => true;
  sup._cloudSignedInAtAll = () => true;
  sup._cloudInUseState = () => inUse;
  sup._cloudReady = () => inUse === 'ready';
  return { sup, product };
}
const busyHere = (sup, n) => { for (let i = 0; i < n; i += 1) sup.sessions.set(`w-here${i}`, { itemId: `w-here${i}`, engine: 'claude', sessionId: `h${i}`, child: { kill() {} }, tail: [] }); };
const inCloud = (sup, n) => { for (let i = 0; i < n; i += 1) sup.sessions.set(`w-cloud${i}`, { itemId: `w-cloud${i}`, engine: 'claude', cloud: true, sessionId: `c${i}`, child: { kill() {} }, tail: [] }); };
const item = { id: 'w-next', product: 'p' };
const cwd = '/r/.claude/worktrees/w-next';

describe('with Everything on and the cloud account at its limit', () => {
  it('a new thread runs on this Mac when this Mac has room', () => {
    const { sup, product } = make();
    expect(sup._waitsForCloud(item, 'claude')).toBe(false);
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('local');
    expect(sup._roomFor('claude', item)).toBe(true);
  });

  it('a reply runs here too', () => {
    const { sup, product } = make();
    expect(sup._whereToRun({ item: { ...item, answer: 'continue' }, product, cwd, engine: 'claude', continuation: true })).toBe('local');
  });

  it('this Mac\'s own cap still holds: with both slots taken, nothing more starts', () => {
    const { sup } = make();
    busyHere(sup, 2);
    expect(sup._localSlotFor('claude')).toBe(false);
    expect(sup._roomFor('claude', item)).toBe(false);
  });

  it('the one before the cap still starts', () => {
    const { sup } = make();
    busyHere(sup, 1);
    expect(sup._roomFor('claude', item)).toBe(true);
  });
});

describe('what still waits for the cloud', () => {
  it('a cloud that is full, with its account fine, is waited for', () => {
    const { sup, product } = make({ inUse: 'ready' });
    inCloud(sup, sup._maxCloud());
    expect(sup._waitsForCloud(item, 'claude')).toBe(true);
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('cloud-wait');
  });

  it('a Codex sign-in being renewed is waited for, since it is back in moments', () => {
    const { sup } = make({ inUse: 'renew' });
    sup.engineChoices = () => [{ id: 'claude' }, { id: 'codex' }];
    expect(sup._waitsForCloud(item, 'codex')).toBe(true);
  });

  it('a cloud with room and a working account takes the thread', () => {
    const { sup, product } = make({ inUse: 'ready' });
    sup._cloudStarting = () => 0;
    sup._mayRunInCloud = () => true;
    expect(sup._whereToRun({ item, product, cwd, engine: 'claude' })).toBe('cloud');
  });
});

describe('the cloud menu', () => {
  const at = Date.UTC(2026, 9, 26, 23, 40);
  const cloud = (mode) => ({ setUp: true, mode, running: 0, accounts: [{ engine: 'claude', key: 'a', ready: false, state: 'limited', limitedUntil: at + 55 * 60_000, inUse: true }] });
  it('says threads run on this Mac until the reset, with Everything as with "when this Mac is full"', () => {
    expect(cloudFootLine(cloud('all'), at)).toMatch(/Threads run on this Mac until then\.$/);
    expect(cloudFootLine(cloud('full'), at)).toMatch(/Threads run on this Mac until then\.$/);
  });
});

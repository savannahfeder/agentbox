// A TASK WAITING ON A USAGE LIMIT SAYS SO, NOT "QUEUED".
//
// Found 2026-10-12 by the pre-deploy check's breaker (an agent told to break
// the app through its screen, .claude/skills/verify-agentbox). With the only
// Codex login out of usage, every new Codex task read "Queued. An agent starts
// on it as soon as one is free." and sat there, while Claude tasks sent after
// it ran at once. Nothing was going to start it: `_capacityFor('codex')` counts
// only logins that are not resting, so Codex had no slots until the reset.
//
// The same lie was fixed for a signed-out tool on 2026-10-04 (signInNeeded,
// tests/agents-come-back-the-moment-she-signs-in-again). This is its sibling:
// `atLimit` names the rows held by a tool whose every login is out of usage,
// and the row says that and when it resets.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { liveLine, shortWord } from '../renderer/src/live-line.ts';

const T0 = new Date(2026, 9, 12, 17, 40, 0).getTime();
const RESET = new Date(2026, 9, 12, 23, 59, 0).getTime();
const MIN = 60_000;

let root;
let sup;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-at-limit-'));
  sup = new Supervisor(
    { home: path.join(root, 'home'), storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    { listItems: () => [], listProducts: () => [] },
    '/nonexistent-app',
  );
  // One login per engine, whatever this Mac has installed.
  sup._profilesFor = () => ['default'];
  sup._engineFor = (i) => i.engine ?? 'claude';
});

afterEach(() => {
  try { sup.stop?.(); } catch {}
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

const outOfUsage = (engine, until = RESET) => {
  const key = sup._accountKey(engine, 'default');
  sup._profileTrouble = { ...(sup._profileTrouble ?? {}), [key]: { since: T0, at: T0, cause: 'at-limit', resetsAt: until } };
  sup._profileCooldown = { ...(sup._profileCooldown ?? {}), [key]: until };
};
const rows = [
  { id: 'w-codex', product: 'p', status: 'open', engine: 'codex' },
  { id: 'w-claude', product: 'p', status: 'open', engine: 'claude' },
];

describe('which rows are held by a usage limit', () => {
  it('names the Codex rows, with the tool and when it resets, while every Codex login is out', () => {
    outOfUsage('codex');
    expect(sup._waitingOnLimit(rows)).toEqual({ 'w-codex': { tool: 'Codex', until: RESET } });
  });

  it('gives no time when the tool printed none, rather than the app\'s own retry clock', () => {
    outOfUsage('codex');
    delete sup._profileTrouble[sup._accountKey('codex', 'default')].resetsAt;
    expect(sup._waitingOnLimit(rows)).toEqual({ 'w-codex': { tool: 'Codex', until: 0 } });
  });

  it('lets them go the moment the limit resets', () => {
    outOfUsage('codex');
    vi.setSystemTime(RESET + MIN);
    expect(sup._waitingOnLimit(rows)).toEqual({});
  });

  it('must NOT name a row whose tool still has a login that can run', () => {
    outOfUsage('codex');
    sup._profilesFor = (e) => (e === 'codex' ? ['default', 'second'] : ['default']);
    expect(sup._waitingOnLimit(rows)).toEqual({});
  });

  it('must NOT name a login resting for any other reason (that is not a usage limit)', () => {
    outOfUsage('codex');
    sup._profileTrouble[sup._accountKey('codex', 'default')].cause = 'unknown';
    expect(sup._waitingOnLimit(rows)).toEqual({});
  });

  it('must NOT name a row an agent is already on, or one that is not open', () => {
    outOfUsage('codex');
    sup.sessions.set('w-codex', { itemId: 'w-codex' });
    expect(sup._waitingOnLimit([...rows, { id: 'w-done', product: 'p', status: 'done', engine: 'codex' }])).toEqual({});
  });

  it('is on the status the window reads', () => {
    outOfUsage('codex');
    sup.store = { listItems: () => rows, listProducts: () => [] };
    expect(sup.status().atLimit).toEqual({ 'w-codex': { tool: 'Codex', until: RESET } });
  });
});

describe('what the row says', () => {
  const row = { id: 'w-codex', status: 'open' };

  it('says the tool is at its usage limit and when it starts, instead of "Queued"', () => {
    const live = liveLine(row, { queued: ['w-codex'], atLimit: { 'w-codex': { tool: 'Codex', until: RESET } }, inProgress: true, now: T0 });
    expect(live.state).toBe('limit');
    expect(shortWord(live.state)).toBe('At its limit');
    expect(live.line).toMatch(/^Codex is at its usage limit, so this starts on its own when it resets at 11:59/);
    expect(live.line).not.toMatch(/as soon as one is free/);
  });

  it('without a known reset time, still says why', () => {
    const live = liveLine(row, { queued: ['w-codex'], atLimit: { 'w-codex': { tool: 'Codex', until: 0 } }, inProgress: true, now: T0 });
    expect(live.line).toBe('Codex is at its usage limit, so this starts on its own when it resets.');
  });

  it('a row not held by a limit is still just queued', () => {
    const live = liveLine(row, { queued: ['w-codex'], atLimit: { 'w-other': { tool: 'Codex', until: RESET } }, inProgress: true, now: T0 });
    expect(live.state).toBe('queued');
  });
});

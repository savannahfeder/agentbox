// A queued run never started after the account came back.
// Around midnight the only Claude account behind the team's agents used
// up its week; it was fixed at 00:06. Sofia's reply still read "Queued. An
// agent starts on it as soon as one is free." at 00:07, 00:20 and 00:24 with
// nothing running, and Maya's chief of staff said "is waiting for a free agent
// ... Stop" for hours under a message whose answer had already come.
// Measured: a limit with no healthy account left brakes the whole fleet until
// the reset the message printed, days off for a weekly limit. A usage reading
// that proved the account free again took the account's own mark off but left
// that brake on, so every pass returned before starting anything, and the
// brake was not a reason the queued line names, so it promised an agent.
// The teammate's chat line said "waiting for a free agent" for any open run
// with no session, queued or not.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { cannotStartLine } from '../renderer/src/live-line.ts';
import { liveLine } from '../renderer/src/teammates/chat-lines.ts';

const WEEKLY = "You've hit your weekly limit · resets 9am";
const T0 = new Date(2026, 10, 1, 0, 0, 0).getTime();
const MIN = 60_000;
let root; let sup;

const limitDeath = () => ({
  itemId: 'w-v5', product: 'p', profile: 'default', startedAt: Date.now() - 2_000,
  tail: [`stderr: ${WEEKLY}`, 'session exited (1)'],
});
const reading = (percent, at = Date.now()) => ({ at, limits: [{ span: 'week', name: 'This week', percent }] });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'brake-lifts-'));
  sup = new Supervisor(
    { home: root, storeRoot: root, maxConcurrentSessions: 3, authProfiles: ['default'] },
    { listItems: () => [], listProducts: () => [] },
    '/nonexistent-app',
  );
  sup.wake = vi.fn();
});
afterEach(() => {
  try { sup.stop?.(); } catch {}
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('the fleet brake a limit puts on', () => {
  it('comes off when a reading after it shows the account free', () => {
    sup.noteExitForBackoff(limitDeath());
    expect(sup._spawnBraked()).toBe(true);
    vi.setSystemTime(T0 + 6 * MIN);
    expect(sup.noteUsageReading('default', reading(6))).toBe(true);
    expect(sup._spawnBraked()).toBe(false);
    expect(sup.wake).toHaveBeenCalled();
  });

  it('stays while the reading still says 100%', () => {
    sup.noteExitForBackoff(limitDeath());
    vi.setSystemTime(T0 + 6 * MIN);
    sup.noteUsageReading('default', reading(100));
    expect(sup._spawnBraked()).toBe(true);
  });

  it('stays for a reading taken before the run died', () => {
    vi.setSystemTime(T0 + MIN);
    sup.noteExitForBackoff(limitDeath());
    sup.noteUsageReading('default', reading(6, T0));
    expect(sup._spawnBraked()).toBe(true);
  });
});

describe('what a queued row says while the fleet is braked', () => {
  it('names the brake rather than promising an agent', () => {
    const line = cannotStartLine({ why: 'brake', tool: 'Claude Code' });
    expect(line).toMatch(/Claude Code/);
    expect(line).not.toMatch(/as soon as one is free/);
    const status = fs.readFileSync(new URL('../main/supervisor.mts', import.meta.url), 'utf8');
    expect(status).toMatch(/SAID_WHY_NOT_STARTED = new Set\(\[[^\]]*'brake'/);
  });
});

describe("a teammate's chat line", () => {
  const t = { name: 'Chief of staff', running: { id: 'w-cos' }, now: 'Working on it' };
  it('says it waits for a free agent only while its run is queued', () => {
    expect(JSON.stringify(liveLine(t, null, T0, null, { queued: true }))).toMatch(/free agent/i);
  });
  it('says nothing of the kind once nothing will start it', () => {
    expect(liveLine(t, null, T0, null, { queued: false })).toBe(null);
  });
  it('a run with a session still says what it is doing', () => {
    expect(liveLine(t, { startedAt: T0 - 5_000, activity: [] }, T0, null, { queued: false })?.state).toBe('working');
  });
});

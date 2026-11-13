// CODEX OUT OF USAGE SAYS WHEN IT COMES BACK.
//
// A tester saw "Codex is out of usage" eight times in one round with no time to
// plan around. Measured in `_waitingOnLimit`: Codex's refusal ("You've hit your
// usage limit.") prints no hour, so `until` was 0 and the toast and the row had
// nothing to say, while Codex's own reading of that login (its session log, or
// the app-server's push) carried `resets_at` for the spent window the whole time.
// And a reset on another day read as today: "out until 4pm" for Sunday's.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mts';
import { captureCodexEvent } from '../main/codex.mts';
import { codexBackAt } from '../shared/codex-usage.mts';
import { sentLine } from '../renderer/src/compose-says';
import { liveLine } from '../renderer/src/live-line.ts';

const NOW = new Date(2026, 10, 11, 10, 0, 0).getTime();
const HOUR = 3600_000;
const limit = (over = {}) => ({ span: 'week', qualifier: null, name: 'This week', percent: 40, resetsText: null, resetsOn: null, resetsAt: NOW + 50 * HOUR, zone: null, reached: false, ...over });

describe('when a spent Codex window comes back', () => {
  it('is the reset of the window at its limit', () => {
    expect(codexBackAt([limit({ span: 'session', percent: 30, resetsAt: NOW + HOUR }), limit({ percent: 100 })], NOW)).toBe(NOW + 50 * HOUR);
  });
  it('is the reset of the window Codex says it refused, below a hundred too', () => {
    expect(codexBackAt([limit({ span: 'session', percent: 96, reached: true, resetsAt: NOW + 2 * HOUR }), limit()], NOW)).toBe(NOW + 2 * HOUR);
  });
  it('is the later one when both are spent, since nothing runs till then', () => {
    expect(codexBackAt([limit({ span: 'session', percent: 100, resetsAt: NOW + HOUR }), limit({ percent: 100 })], NOW)).toBe(NOW + 50 * HOUR);
  });
  it('is unknown when no window is spent, none says when, or the reset has passed', () => {
    expect(codexBackAt([limit()], NOW)).toBeNull();
    expect(codexBackAt([limit({ percent: 100, resetsAt: null })], NOW)).toBeNull();
    expect(codexBackAt([limit({ percent: 100, resetsAt: NOW - 1 })], NOW)).toBeNull();
    expect(codexBackAt(null, NOW)).toBeNull();
  });
});

describe('a thread held by a Codex limit that printed no hour', () => {
  let root;
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-back-')); });
  afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

  const held = (reading) => {
    // codexHome keeps this Mac's own Codex usage reading out of the test.
    const sup = new Supervisor({ storeRoot: root, home: path.join(root, 'home'), codexHome: path.join(root, 'codex'), maxConcurrentSessions: 3, authProfiles: ['default'] },
      { listItems: () => [], listProducts: () => [], recordSessionResult: () => {} }, root, root, root);
    sup._profilesFor = () => ['default'];
    sup._engineFor = (i) => i.engine ?? 'codex';
    sup.codexUsage = () => reading;
    const says = 'You\'ve hit your usage limit.';
    const run = { itemId: 'w-1', product: 'p', engine: 'codex', profile: 'default', startedAt: NOW - 900, tail: [`stderr: usageLimitExceeded: ${says}`] };
    captureCodexEvent(run, 'thread/started', { thread: { id: 'th_01JQ' } });
    captureCodexEvent(run, 'turn/failed', { turn: { status: 'failed', error: { message: says, codexErrorInfo: 'usageLimitExceeded' } } });
    sup.noteExitForBackoff(run, { onLine: () => {} });
    return sup._waitingOnLimit([{ id: 'w-1', product: 'p', status: 'open', engine: 'codex' }]);
  };

  it("takes the reset from Codex's own reading of that login", () => {
    expect(held({ limits: [limit({ percent: 100 })], at: NOW - 60_000 })).toEqual({ 'w-1': { tool: 'Codex', until: NOW + 50 * HOUR } });
  });
  it('stays unknown when the reading has nothing spent in it, or there is no reading', () => {
    expect(held({ limits: [limit()], at: NOW - 60_000 })).toEqual({ 'w-1': { tool: 'Codex', until: 0 } });
    expect(held(null)).toEqual({ 'w-1': { tool: 'Codex', until: 0 } });
  });
});

describe('the words', () => {
  const at4 = new Date(2026, 10, 11, 16, 0, 0).getTime();
  const sunday4 = new Date(2026, 10, 15, 16, 0, 0).getTime();
  it('the toast names the hour, and the day when it is not today', () => {
    expect(sentLine({ to: 'Web app', limit: { tool: 'Codex', until: at4 }, now: NOW })).toBe('Codex is out until 4:00pm · Z to undo');
    expect(sentLine({ to: 'Web app', limit: { tool: 'Codex', until: sunday4 }, now: NOW })).toBe('Codex is out until 4:00pm Sun · Z to undo');
  });
  it('the toast says only that it is out when nobody knows when it comes back', () => {
    expect(sentLine({ to: 'Web app', limit: { tool: 'Codex', until: 0 }, now: NOW })).toBe('Codex is out of usage · Z to undo');
  });
  it("the row's line says the day and the hour in one sentence", () => {
    const line = liveLine({ id: 'w-1', status: 'open' }, { queued: ['w-1'], atLimit: { 'w-1': { tool: 'Codex', until: sunday4 } }, inProgress: true, now: NOW }).line;
    expect(line).toBe('Codex is at its usage limit, so this starts on its own when it resets on Sun at 4:00pm.');
  });
});

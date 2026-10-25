// A LOGIN OUT OF USAGE DOES NOT START A THREAD AGAIN AND AGAIN.
//
// What broke (power test 2, 2026-10-20): three Codex threads, each replied to
// while the ChatGPT login was out of usage, were started 7 times in ten
// minutes, across a restart of the app, and one of them had nothing written on
// it for 14 and a half minutes. The start-storm guard never fired.
//
// Measured in the code by driving the real frames `codex app-server` sends for
// a 429: `thread/started` gives the session an id and `turn/failed` gives it an
// error result, and `_noteHowTheRunStarted` read either of those as "the agent
// got going", so NOT ONE of those starts was counted. The count it does keep
// was never saved either, so the restart would have forgotten it anyway.
//
// And the storm itself: a limit that does not print a reset hour only benched
// the login on its THIRD strike, so the two runs before that went straight back
// to the capped login, with the row reading "Queued" and saying nothing.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { captureCodexEvent } from '../main/codex.mjs';
import { liveLine } from '../renderer/src/live-line.ts';

const T0 = new Date(2026, 9, 20, 21, 38, 0).getTime();
const MIN = 60_000;
let root; let said;

function supervisor() {
  const sup = new Supervisor(
    { storeRoot: root, home: path.join(root, 'home'), maxConcurrentSessions: 3, authProfiles: ['default'] },
    {
      listItems: () => [], listProducts: () => [],
      recordSessionResult: (product, id, patch) => { said.push({ product, id, ...patch }); },
    },
    root, root, root,
  );
  sup._profilesFor = () => ['default'];
  sup._engineFor = (i) => i.engine ?? 'codex';
  return sup;
}

const item = (extra = {}) => ({ id: 'w-1', product: 'p', title: 'T', status: 'open', engine: 'codex', ...extra });

// The run as its exit handler meets it: the app-server's own frames, in order,
// through the one reader that turns them into a session.
function codexRun({ says = 'You\'ve hit your usage limit.', answered = null, ran = 900 } = {}) {
  const session = {
    itemId: 'w-1', product: 'p', engine: 'codex', profile: 'default',
    startedAt: Date.now() - ran, tail: [],
  };
  captureCodexEvent(session, 'thread/started', { thread: { id: 'th_01JQ' } });
  if (answered) {
    captureCodexEvent(session, 'item/completed', { item: { type: 'agentMessage', phase: 'final_answer', text: answered } });
    captureCodexEvent(session, 'turn/completed', { turn: { status: 'completed', items: [] } });
    return session;
  }
  session.tail.push(`stderr: usageLimitExceeded: ${says}`);
  captureCodexEvent(session, 'turn/failed', {
    turn: { status: 'failed', error: { message: says, codexErrorInfo: 'usageLimitExceeded' } },
  });
  return session;
}

// A reply landing on the thread every fifteen seconds, the pace the app checks at.
function startsIn(sup, minutes, row = item(), run = () => codexRun()) {
  let started = 0;
  const from = Date.now();
  for (let t = 0; t < minutes * MIN; t += 15_000) {
    vi.setSystemTime(from + t);
    if (sup._heldFromStarting(row)) continue;
    started += 1;
    vi.setSystemTime(from + t + 900);
    sup._noteHowTheRunStarted(row, run());
  }
  return started;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'out-of-usage-'));
  said = [];
});

afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a run the login refused because it is out of usage', () => {
  it('is a start whose agent never began, though the thread has an id and an error', () => {
    const run = codexRun();
    expect(run.sessionId).toBe('th_01JQ');
    expect(run.resultIsError).toBe(true);
    const sup = supervisor();
    expect(startsIn(sup, 10)).toBe(6);
    expect(sup._heldFromStarting(item())).toBe(true);
  });

  it('says so on the row once, in the words of the limit itself', () => {
    const sup = supervisor();
    startsIn(sup, 10);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({ product: 'p', id: 'w-1', status: 'blocked' });
    expect(said[0].result).toMatch(/stopped starting this thread/i);
    expect(said[0].result).toMatch(/hit your usage limit/i);
  });

  it('counts a refusal that took two minutes to arrive, as a weekly limit does', () => {
    const sup = supervisor();
    for (let i = 0; i < 6; i += 1) {
      vi.setSystemTime(T0 + i * 90_000);
      sup._noteHowTheRunStarted(item(), codexRun({ ran: 2 * MIN }));
    }
    expect(sup._heldFromStarting(item())).toBe(true);
  });

  it('is still counted after the app quits and opens again', () => {
    const first = supervisor();
    for (let i = 0; i < 3; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      first._noteHowTheRunStarted(item(), codexRun());
    }
    const second = supervisor();
    for (let i = 3; i < 6; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      second._noteHowTheRunStarted(item(), codexRun());
    }
    expect(second._heldFromStarting(item())).toBe(true);
  });

  it('must NOT hold a thread on five starts in ten minutes', () => {
    const sup = supervisor();
    for (let i = 0; i < 5; i += 1) {
      vi.setSystemTime(T0 + i * MIN);
      sup._noteHowTheRunStarted(item(), codexRun());
    }
    expect(sup._heldFromStarting(item())).toBe(false);
    expect(said).toEqual([]);
  });

  it('must NOT hold a thread whose runs answered in between', () => {
    const sup = supervisor();
    for (let i = 0; i < 5; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      sup._noteHowTheRunStarted(item(), codexRun());
    }
    vi.setSystemTime(T0 + 5 * 30_000);
    sup._noteHowTheRunStarted(item(), codexRun({ answered: 'The price is £39 a seat.', ran: 40_000 }));
    for (let i = 6; i < 11; i += 1) {
      vi.setSystemTime(T0 + i * 30_000);
      sup._noteHowTheRunStarted(item(), codexRun());
    }
    expect(sup._heldFromStarting(item())).toBe(false);
  });

  it('must NOT hold a thread whose refusals are an hour apart', () => {
    const sup = supervisor();
    for (let i = 0; i < 8; i += 1) {
      vi.setSystemTime(T0 + i * 60 * MIN);
      sup._noteHowTheRunStarted(item(), codexRun());
    }
    expect(sup._heldFromStarting(item())).toBe(false);
  });

  it('must NOT hold another thread', () => {
    const sup = supervisor();
    startsIn(sup, 10);
    expect(sup._heldFromStarting(item({ id: 'w-2' }))).toBe(false);
  });
});

describe('the login is benched the first time it says it is out of usage', () => {
  const rows = [item(), { id: 'w-2', product: 'p', status: 'open', engine: 'claude' }];
  const bench = (sup, says) => sup.noteExitForBackoff(codexRun({ says }), { onLine: () => {} });

  it('so the row says the limit holds it, rather than being started again fifteen seconds later', () => {
    const sup = supervisor();
    bench(sup);
    const key = sup._accountKey('codex', 'default');
    expect(sup._profileTrouble[key].cause).toBe('at-limit');
    expect(sup._profileCooldown[key]).toBeGreaterThan(Date.now());
    expect(sup._waitingOnLimit(rows)).toEqual({ 'w-1': { tool: 'Codex', until: 0 } });
    const live = liveLine({ id: 'w-1', status: 'open' }, { queued: ['w-1'], atLimit: sup._waitingOnLimit(rows), inProgress: true, now: Date.now() });
    expect(live.line).toBe('Codex is at its usage limit, so this starts on its own when it resets.');
  });

  it('and tries again on its own, without a word from anyone', () => {
    const sup = supervisor();
    bench(sup);
    const key = sup._accountKey('codex', 'default');
    const rest = sup._profileCooldown[key] - Date.now();
    expect(rest).toBeGreaterThanOrEqual(5 * MIN);
    expect(rest).toBeLessThanOrEqual(30 * MIN);
  });

  it('waits to the hour the limit named, when it named one', () => {
    const sup = supervisor();
    bench(sup, 'You\'ve hit your usage limit. Try again at Oct 20th, 2026 11:30 PM.');
    const key = sup._accountKey('codex', 'default');
    const reset = new Date(2026, 9, 20, 23, 30, 0).getTime();
    expect(sup._profileCooldown[key]).toBeGreaterThanOrEqual(reset);
    expect(sup._profileCooldown[key]).toBeLessThan(reset + MIN);
    expect(sup._waitingOnLimit(rows)).toEqual({ 'w-1': { tool: 'Codex', until: reset } });
  });

  it('must NOT bench a login on one failure that is not the account refusing it', () => {
    const sup = supervisor();
    const run = codexRun({ says: 'stream disconnected before completion: connection closed' });
    sup.noteExitForBackoff(run, { onLine: () => {} });
    expect(sup._profileCooldown?.[sup._accountKey('codex', 'default')] ?? 0).toBe(0);
  });
});
